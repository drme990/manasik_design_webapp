import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Pressable,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";

import { colors, fonts, isRTLText, radius, spacing } from "@/src/theme";
import {
  AnyLayer,
  ExportedItem,
  ImageLayer,
  CollageLayout,
  Project,
  ShapeLayer,
  ShapeType,
  TextLayer,
  addExport,
  getProject,
  saveProject,
} from "@/src/store/projects";
import LayerRenderer from "@/src/components/LayerRenderer";
import { ColorPickerSheet } from "@/src/components/ColorPickerSheet";
import CollageCellEditorModal from "@/src/components/CollageCellEditorModal";
import { LAYOUTS as COLLAGE_LAYOUTS, layoutsForCount, type Shape as CollageShape } from "@/src/utils/collage-layouts";
import { captureCanvas, hasNativeEyeDropper, pickColorFromScreen, type PickerSnapshot } from "@/src/utils/eyedropper-v2";
import { AspectRatioPicker, AspectRatioOption, RATIO_OPTIONS } from "@/src/components/AspectRatioPicker";
import { DraggableLayerList } from "@/src/components/DraggableLayerList";
import { SelectionBox } from "@/src/components/SelectionBox";
import { ImageCropModal } from "@/src/components/ImageCropModal";
import {
  ARABIC_SAFE_FONTS,
  COLOR_PALETTE,
  buildDynamicFieldLayer,
  buildImageLayer,
  buildShapeLayer,
  buildTextLayer,
  cloneLayer,
  nextZIndex,
} from "@/src/editor/layer-utils";
import { PREDEFINED_VARIABLES, type PredefinedVariable } from "@/src/store/booking-templates";

const SCREEN = Dimensions.get("window");
const SAFE_MARGIN_RATIO = 0.05; // 5% safe margin
const SNAP_THRESHOLD_PX = 8;

/**
 * Returns `true` when the hex color is "light" enough that putting it on a
 * white background would make it nearly invisible. Used to flip the text-edit
 * input background to a dark surface for white/light text colors.
 */
function isLightHex(hex: string | undefined | null): boolean {
  if (!hex || typeof hex !== "string") return false;
  const h = hex.replace("#", "").trim();
  if (h.length !== 3 && h.length !== 6) return false;
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  if ([r, g, b].some((v) => Number.isNaN(v))) return false;
  // Perceived luminance (BT.601). >220 means very light → use dark surface.
  const Y = 0.299 * r + 0.587 * g + 0.114 * b;
  return Y > 220;
}

export default function EditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  /** Modal for picking the variable bound to a NEW dynamic-field
   *  layer. Only used when the project is a booking template. */
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [editingText, setEditingText] = useState<TextLayer | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);
  const [outsideSafe, setOutsideSafe] = useState(false);
  // Image-inside-mask edit mode (per-layer)
  const [editingMaskId, setEditingMaskId] = useState<string | null>(null);
  // Crop modal (rectangle clipping tool) — replaces the previous slider-based crop UX.
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  // Measured sizes for text layers (canvas units), used for accurate snap, resize bbox, and overlay positioning.
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, { w: number; h: number }>>({});
  const measuredSizesRef = useRef<Record<string, { w: number; h: number }>>({});

  // History
  const historyRef = useRef<Project[]>([]);
  const futureRef = useRef<Project[]>([]);
  const [_, force] = useState(0);
  const canvasRef = useRef<View>(null);
  // Tracks the last time ANY layer was touched. Used by the backdrop tap to
  // guard against a race where the backdrop tap also fires for a touch that
  // was actually claimed by a child layer gesture (rare RNGH edge case).
  const lastLayerTouchAt = useRef<number>(0);

  const safeDeselect = useCallback(() => {
    if (Date.now() - lastLayerTouchAt.current < 200) return;
    setSelectedId(null);
  }, []);

  // Backdrop tap for deselection — uses Gesture.Tap (RNGH) instead of
  // Pressable so it composes correctly with the per-layer gesture handlers.
  // When user taps on a layer, the layer's own Tap/Pan gesture activates
  // first (RNGH cancels parent gestures when a child gesture wins), so this
  // backdrop tap only fires for taps on empty canvas area.
  const backdropTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(280)
        .onEnd(() => {
          runOnJS(safeDeselect)();
        }),
    [safeDeselect],
  );

  // Load
  useEffect(() => {
    (async () => {
      if (!id) return;
      const p = await getProject(id);
      if (p) {
        setProject(p);
        historyRef.current = [JSON.parse(JSON.stringify(p))];
      } else {
        Alert.alert("لم يعثر على المشروع");
        router.back();
      }
    })();
  }, [id, router]);

  // Auto-save when project changes
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => {
      saveProject(project).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [project]);

  const pushHistory = useCallback((p: Project) => {
    historyRef.current = [...historyRef.current.slice(-30), JSON.parse(JSON.stringify(p))];
    futureRef.current = [];
    force((x) => x + 1);
  }, []);

  const updateProject = useCallback(
    (updater: (p: Project) => Project, recordHistory = true) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (recordHistory) pushHistory(next);
        return next;
      });
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (historyRef.current.length < 2) return;
    const cur = historyRef.current.pop();
    if (cur) futureRef.current.push(cur);
    const prev = historyRef.current[historyRef.current.length - 1];
    setProject(JSON.parse(JSON.stringify(prev)));
    force((x) => x + 1);
  }, []);

  const redo = useCallback(() => {
    const nxt = futureRef.current.pop();
    if (!nxt) return;
    historyRef.current.push(nxt);
    setProject(JSON.parse(JSON.stringify(nxt)));
    force((x) => x + 1);
  }, []);

  // Compute canvas display size
  const canvasArea = useMemo(() => {
    if (!project) return { w: 1, h: 1, scale: 1 };
    const screenW = SCREEN.width;
    const screenH = SCREEN.height;
    const availW = screenW - 24;
    const availH = screenH - insets.top - 220 - insets.bottom; // headers + toolbars
    const scale = Math.min(availW / project.canvasWidth, availH / project.canvasHeight);
    return {
      w: project.canvasWidth * scale,
      h: project.canvasHeight * scale,
      scale,
    };
  }, [project, insets.top, insets.bottom]);

  const selected: AnyLayer | null = useMemo(() => {
    if (!project || !selectedId) return null;
    return project.layers.find((l) => l.id === selectedId) || null;
  }, [project, selectedId]);

  // Layer mutation helpers
  const updateLayer = useCallback(
    (layerId: string, patch: Partial<AnyLayer>, record = true) => {
      updateProject((p) => {
        const next: Project = {
          ...p,
          layers: p.layers.map((l) =>
            l.id === layerId ? ({ ...l, ...patch } as AnyLayer) : l,
          ),
        };
        return next;
      }, record);
    },
    [updateProject],
  );

  const removeLayer = useCallback(
    (layerId: string) => {
      updateProject((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== layerId) }));
      if (selectedId === layerId) setSelectedId(null);
    },
    [updateProject, selectedId],
  );

  const duplicateLayer = useCallback(
    (layerId: string) => {
      if (!project) return;
      const l = project.layers.find((x) => x.id === layerId);
      if (!l) return;
      const z = nextZIndex(project.layers);
      const dup = cloneLayer(l, z);
      updateProject((p) => ({ ...p, layers: [...p.layers, dup] }));
      setSelectedId(dup.id);
    },
    [project, updateProject],
  );

  const addTextLayer = useCallback(() => {
    if (!project) return;
    const z = nextZIndex(project.layers);
    const l = buildTextLayer(project.canvasWidth, project.canvasHeight, z);
    updateProject((p) => ({ ...p, layers: [...p.layers, l] }));
    setSelectedId(l.id);
    setShowAddSheet(false);
    // Auto-open text editor for immediate typing UX.
    setTimeout(() => setEditingText(l), 200);
  }, [project, updateProject]);

  const addShapeLayer = useCallback(
    (shape: ShapeType) => {
      if (!project) return;
      const z = nextZIndex(project.layers);
      const l = buildShapeLayer(project.canvasWidth, project.canvasHeight, z, shape);
      updateProject((p) => ({ ...p, layers: [...p.layers, l] }));
      setSelectedId(l.id);
      setShowAddSheet(false);
    },
    [project, updateProject],
  );

  /** Drop a dynamic-field placeholder onto the canvas. Only callable
   *  when the open project is a booking template (the AddLayerSheet
   *  hides the entry for regular designs). Opens the variable picker
   *  immediately so the field is meaningful from the moment it lands. */
  const addDynamicFieldLayer = useCallback(() => {
    if (!project) return;
    setShowAddSheet(false);
    // Defer the picker by a tick so the sheet's close animation can
    // finish before another modal slides in.
    setTimeout(() => setShowVariablePicker(true), 200);
  }, [project]);

  /** Modal state used when the user picks an image-type variable —
   *  we ask for the placeholder dimensions before placing it. */
  const [pendingImageVar, setPendingImageVar] = useState<
    | null
    | {
        fieldType: "image";
        variableName: string;
        variableLabel: string;
        defaultValue: string;
      }
  >(null);

  const handlePickedVariable = useCallback(
    (v: PredefinedVariable | { custom: true; name: string; label: string }) => {
      if (!project) return;
      const isCustom = "custom" in v;
      const fieldType = isCustom ? ("custom" as const) : v.fieldType;
      const variableName = v.name;
      const variableLabel = v.label;
      const defaultValue = isCustom ? v.label : v.defaultValue;

      // For image-type variables, route through an extra dimensions
      // dialog so the operator decides upfront how big the placeholder
      // should be (per user request).
      if (fieldType === "image") {
        setShowVariablePicker(false);
        setPendingImageVar({
          fieldType: "image",
          variableName,
          variableLabel,
          defaultValue,
        });
        return;
      }

      const z = nextZIndex(project.layers);
      const l = buildDynamicFieldLayer(project.canvasWidth, project.canvasHeight, z, {
        fieldType,
        variableName,
        variableLabel,
        defaultValue,
      });
      updateProject((p) => ({ ...p, layers: [...p.layers, l] }));
      setSelectedId(l.id);
      setShowVariablePicker(false);
    },
    [project, updateProject],
  );

  /** Called from `ImageFieldSizeModal` after the operator confirms
   *  width × height. Builds the dynamic-field layer with the chosen
   *  dimensions and drops it on the canvas. */
  const handlePickedImageSize = useCallback(
    (w: number, h: number) => {
      if (!project || !pendingImageVar) return;
      const z = nextZIndex(project.layers);
      const l = buildDynamicFieldLayer(project.canvasWidth, project.canvasHeight, z, {
        fieldType: "image",
        variableName: pendingImageVar.variableName,
        variableLabel: pendingImageVar.variableLabel,
        defaultValue: pendingImageVar.defaultValue,
      });
      // Override the default placeholder size with the operator's choice.
      l.width = w;
      l.height = h;
      updateProject((p) => ({ ...p, layers: [...p.layers, l] }));
      setSelectedId(l.id);
      setPendingImageVar(null);
    },
    [project, pendingImageVar, updateProject],
  );

  const addImageLayer = useCallback(async () => {
    if (!project) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("إذن مطلوب", "نحتاج الإذن للوصول إلى الصور");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      // SDK 54+: MediaTypeOptions is deprecated and throws in release builds.
      // Use the string-array form instead.
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
      // Allow multi-pick: if the user picks 2+ images we'll create a
      // collage inside a single image layer. Single image → normal.
      allowsMultipleSelection: true,
      selectionLimit: 9,
    });
    if (r.canceled || !r.assets?.length) return;
    const picked = r.assets.slice(0, 9);
    const first = picked[0];
    const z = nextZIndex(project.layers);
    const l = buildImageLayer(
      project.canvasWidth,
      project.canvasHeight,
      z,
      first.uri,
      first.width || 1080,
      first.height || 1080,
    );
    // If the user picked multiple images, automatically switch this layer
    // to collage mode. All existing image-layer properties (mask, border,
    // radius, opacity, rotation, scale, etc.) remain intact — the toolbar
    // simply gains extra collage controls.
    if (picked.length >= 2) {
      l.collageImages = picked.map((a) => a.uri);
      // Pre-populate per-cell data with a slight zoom (1.3) so the image
      // overflows the cell on all sides — this gives users immediate
      // pan room to reveal hidden edges via drag gestures in the
      // CollageCellEditorModal. Without this default users would see
      // white gaps the moment they start panning.
      l.collageCells = picked.map((a) => ({
        uri: a.uri,
        offsetX: 0,
        offsetY: 0,
        scale: 1.3,
      }));
      l.collageLayout = "auto";
      l.collageGap = 8;
      l.collageCellRadius = 8;
      l.collageBackgroundColor = "#FFFFFF";
    }
    updateProject((p) => ({ ...p, layers: [...p.layers, l] }));
    setSelectedId(l.id);
    setShowAddSheet(false);
  }, [project, updateProject]);

  const replaceBackground = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    updateProject((p) => ({
      ...p,
      backgroundUri: a.uri,
      canvasWidth: a.width || p.canvasWidth,
      canvasHeight: a.height || p.canvasHeight,
    }));
  }, [updateProject]);

  /**
   * Replace the image content of an existing image layer while preserving
   * its frame: position (x, y), mask size, border radius/color/width,
   * opacity, z-index, rotation, scale, flips remain untouched. Only the
   * source `uri`, the intrinsic `width`/`height`, and the cover-fit
   * `imageScale`/`offset` are refreshed for the new asset.
   */
  const replaceImageLayer = useCallback(
    async (layerId: string) => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("إذن مطلوب", "نحتاج الإذن للوصول إلى الصور");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        exif: false,
      });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      const newW = a.width || 1080;
      const newH = a.height || 1080;
      updateProject((p) => ({
        ...p,
        layers: p.layers.map((l) => {
          if (l.id !== layerId || l.type !== "image") return l;
          const il = l as ImageLayer;
          // Cover-fit the new image inside the EXISTING mask.
          const imageScale = Math.max(il.maskWidth / newW, il.maskHeight / newH);
          return {
            ...il,
            uri: a.uri,
            width: newW,
            height: newH,
            imageScale,
            offsetX: 0,
            offsetY: 0,
            // Preserve: x, y, scale, rotation, opacity, zIndex,
            //           maskWidth, maskHeight, borderRadius, borderColor,
            //           borderWidth, flipX, flipY, name, locked, visible
          } as ImageLayer;
        }),
      }));
    },
    [updateProject],
  );

  // ─────────────────────── Eyedropper V2 ───────────────────────
  // Photoshop-style: tap the eyedropper icon in the bottom toolbar to enter
  // "pick mode", move finger/cursor across the canvas to see the live color
  // in a magnifying preview, tap to commit. A small action sheet then asks
  // what to do with the picked color (apply to selected layer / save to
  // brand colors / copy).
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [eyedropPos, setEyedropPos] = useState<{ x: number; y: number } | null>(null);
  const [eyedropColor, setEyedropColor] = useState<string>("#000000");
  const [eyedropReady, setEyedropReady] = useState(false);
  const eyedropColorRef = useRef<string>("#000000");
  const samplerRef = useRef<PickerSnapshot | null>(null);
  // The committed pick: when non-null, the action sheet is shown.
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  const startEyedropper = useCallback(async () => {
    // Web: use the browser's native EyeDropper API (Chrome/Edge/Opera/
    // Safari 17+). This works system-wide — the user can pick any pixel
    // from anywhere on the page, NOT just inside our canvas.
    if (Platform.OS === "web" && hasNativeEyeDropper()) {
      try {
        const { hex } = await pickColorFromScreen();
        setPickedColor(hex);
      } catch {
        // User cancelled or unsupported → silently dismiss.
      }
      return;
    }
    // Native (or older browsers): fall back to in-canvas sampler.
    setEyedropperActive(true);
    setEyedropPos(null);
    setEyedropReady(false);
    samplerRef.current = null;
    setSelectedId(null);
    await new Promise((r) => setTimeout(r, 60));
    const snap = await captureCanvas(canvasRef);
    samplerRef.current = snap;
    setEyedropReady(!!snap);
  }, []);

  const cancelEyedropper = useCallback(() => {
    samplerRef.current = null;
    setEyedropperActive(false);
    setEyedropPos(null);
    setEyedropReady(false);
  }, []);

  // Hover/move: sample the current point.
  const updateEyedrop = useCallback(
    (x: number, y: number) => {
      setEyedropPos({ x, y });
      const s = samplerRef.current;
      if (s) {
        const c = s.sample(x / canvasArea.w, y / canvasArea.h);
        if (c) {
          setEyedropColor(c);
          eyedropColorRef.current = c;
        }
      }
    },
    [canvasArea.w, canvasArea.h],
  );

  // Tap commit: end pick mode and surface the action sheet.
  const commitEyedrop = useCallback(() => {
    const finalColor = eyedropColorRef.current;
    samplerRef.current = null;
    setEyedropperActive(false);
    setEyedropPos(null);
    setEyedropReady(false);
    if (finalColor) setPickedColor(finalColor);
  }, []);

  // Pan to PREVIEW while finger moves, Tap to COMMIT.
  const eyedropPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(eyedropperActive)
        .minDistance(0)
        .onBegin((e) => runOnJS(updateEyedrop)(e.x, e.y))
        .onUpdate((e) => runOnJS(updateEyedrop)(e.x, e.y))
        .onEnd(() => runOnJS(commitEyedrop)()),
    [eyedropperActive, updateEyedrop, commitEyedrop],
  );

  // Apply the picked color to the currently selected layer's "main" color.
  const applyPickedToSelectedLayer = useCallback(
    (hex: string) => {
      if (!selectedId) return false;
      const l = project?.layers.find((x) => x.id === selectedId);
      if (!l) return false;
      if (l.type === "text") {
        updateLayer(l.id, { color: hex });
        return true;
      }
      if (l.type === "shape") {
        updateLayer(l.id, { fill: hex });
        return true;
      }
      if (l.type === "image") {
        updateLayer(l.id, { borderColor: hex });
        return true;
      }
      if (l.type === "dynamic_field") {
        updateLayer(l.id, { color: hex });
        return true;
      }
      return false;
    },
    [selectedId, project, updateLayer],
  );

  // Save the picked color to Brand colors (persisted globally).
  const saveToBrandColors = useCallback(async (hex: string) => {
    try {
      const KEY = "@manasik/brand-colors";
      const raw = await AsyncStorage.getItem(KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(hex)) list.unshift(hex);
      await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
    } catch {
      /* non-fatal */
    }
  }, []);


  // Export
  const onExport = useCallback(async () => {
    if (!project || !canvasRef.current) return;
    try {
      setBusy(true);
      setSelectedId(null);
      // wait one frame for selection outlines to disappear
      await new Promise((r) => setTimeout(r, 80));

      // ─────────────── WEB: capture + browser download ───────────────
      if (Platform.OS === "web") {
        // Resolve the actual DOM node. On react-native-web a View's ref is
        // already the underlying HTMLDivElement, but we keep the safety
        // helpers in case a future RNW upgrade changes that.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const refAny: any = canvasRef.current;
        let node: HTMLElement | null = null;
        if (refAny instanceof HTMLElement) {
          node = refAny;
        } else if (refAny && refAny.nodeType === 1) {
          node = refAny as HTMLElement;
        } else if (typeof refAny?._nativeTag === "string") {
          // older RNW
          node = document.querySelector(`[data-reactroot] [data-tag="${refAny._nativeTag}"]`);
        }
        // Last-ditch fallback: search by a data attribute we can attach.
        if (!node && typeof document !== "undefined") {
          node = document.querySelector('[data-export-root="canvas"]') as HTMLElement | null;
        }
        if (!node) {
          throw new Error("لم أتمكّن من العثور على عنصر الكانفس للتصدير");
        }

        // Use html-to-image. We import it dynamically so it isn't bundled
        // into the native build.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const htmlToImage: any = await import("html-to-image");

        // Some user-picked images on web are blob: URLs. They are
        // same-origin and safe to read, but we still pass cacheBust + an
        // explicit pixelRatio so the output is crisp.
        const dataUrl: string = await htmlToImage.toPng(node, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: project.canvasBg || "#ffffff",
          // Ignore elements that obviously aren't part of the design
          // (selection outlines, gesture overlays, etc.) which can confuse
          // the rasteriser.
          filter: (el: Element) => {
            const ds = (el as HTMLElement)?.dataset;
            if (ds?.exportIgnore === "1") return false;
            return true;
          },
        });
        if (!dataUrl || dataUrl.length < 100) {
          throw new Error("Empty PNG returned by html-to-image");
        }

        // Trigger browser download.
        const safeName = (project.name || "design")
          .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9_-]+/g, "_")
          .slice(0, 60);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${safeName}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Also save to local exports list so it appears on the home screen.
        const item: ExportedItem = {
          id: uuidv4(),
          uri: dataUrl,
          createdAt: Date.now(),
          projectId: project.id,
          projectName: project.name,
        };
        await addExport(item);

        if (typeof window !== "undefined") {
          // eslint-disable-next-line no-alert
          window.alert("تم تصدير التصميم وتحميله ✅");
        }
        return;
      }

      // ─────────────── NATIVE: gallery save + share dialog ───────────────
      const uri = await captureRef(canvasRef.current, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: project.canvasWidth,
        height: project.canvasHeight,
      });

      // Save to gallery (Android/iOS)
      let savedUri = uri;
      try {
        const mPerm = await MediaLibrary.requestPermissionsAsync();
        if (mPerm.granted) {
          const asset = await MediaLibrary.createAssetAsync(uri);
          savedUri = asset.uri;
        }
      } catch (e) {
        console.log("save gallery error", e);
      }

      const item: ExportedItem = {
        id: uuidv4(),
        uri: savedUri,
        createdAt: Date.now(),
        projectId: project.id,
        projectName: project.name,
      };
      await addExport(item);

      Alert.alert("تم التصدير", "تم حفظ التصميم في المعرض", [
        {
          text: "حفظ في المعرض",
          onPress: async () => {
            try {
              const mPerm = await MediaLibrary.requestPermissionsAsync();
              if (mPerm.granted) await MediaLibrary.createAssetAsync(uri);
            } catch {}
          },
        },
        {
          text: "مشاركة",
          onPress: async () => {
            try {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
              }
            } catch {}
          },
        },
        {
          text: "فتح أحدث التصديرات",
          onPress: () => router.push("/"),
        },
        { text: "تم", style: "cancel" },
      ]);
    } catch (e: any) {
      const msg = e?.message || "حدث خطأ";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        // eslint-disable-next-line no-alert
        window.alert("فشل التصدير: " + msg);
      } else {
        Alert.alert("فشل التصدير", msg);
      }
    } finally {
      setBusy(false);
    }
  }, [project]);

  if (!project) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="editor-screen">
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.nameWrap}
          onPress={() => {
            setNameInput(project.name);
            setRenaming(true);
          }}
          testID="rename-btn"
        >
          <Text style={styles.projectName} numberOfLines={1}>
            {project.name}
          </Text>
          <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.topActions}>
          <TouchableOpacity onPress={undo} style={styles.iconBtn} testID="undo-btn">
            <Ionicons name="arrow-undo" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={redo} style={styles.iconBtn} testID="redo-btn">
            <Ionicons name="arrow-redo" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowLayersPanel(true)}
            style={styles.iconBtn}
            testID="layers-btn"
          >
            <Ionicons name="layers-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onExport}
            style={styles.exportBtn}
            disabled={busy}
            testID="export-btn"
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="download" size={16} color="#fff" />
                <Text style={styles.exportBtnText}>تصدير</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas workspace */}
      <View style={styles.workspace}>
        <GestureDetector gesture={backdropTap}>
          <View
            style={[
              styles.canvasFrame,
              { width: canvasArea.w, height: canvasArea.h },
            ]}
            testID="canvas-frame"
          >
          {/* This view is captured for export — render at canvas pixel size & scale down */}
          <View
            ref={canvasRef}
            collapsable={false}
            // @ts-expect-error — RN-Web passes unknown props through to the
            // underlying <div>; we use this attribute as a reliable hook
            // for the html-to-image exporter to find the node.
            dataSet={{ exportRoot: "canvas" }}
            style={{
              width: project.canvasWidth,
              height: project.canvasHeight,
              backgroundColor: project.backgroundColor,
              transform: [
                { translateX: -(project.canvasWidth - canvasArea.w) / 2 },
                { translateY: -(project.canvasHeight - canvasArea.h) / 2 },
                { scale: canvasArea.scale },
              ],
            }}
          >
            {/* Background */}
            {project.backgroundUri ? (
              <ExpoImage
                source={{ uri: project.backgroundUri }}
                style={{
                  position: "absolute",
                  width: project.canvasWidth,
                  height: project.canvasHeight,
                }}
                contentFit="cover"
              />
            ) : null}

            {/* Layers */}
            {[...project.layers]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((layer) => (
                <LayerView
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedId === layer.id}
                  isEditingMask={editingMaskId === layer.id}
                  onSelect={() => {
                    if (editingMaskId && editingMaskId !== layer.id) return;
                    lastLayerTouchAt.current = Date.now();
                    if (!layer.locked) setSelectedId(layer.id);
                  }}
                  onChange={(patch, record) => updateLayer(layer.id, patch, record)}
                  onMeasured={(w, h) => {
                    const prev = measuredSizesRef.current[layer.id];
                    if (prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5) return;
                    measuredSizesRef.current[layer.id] = { w, h };
                    setMeasuredSizes((m) => ({ ...m, [layer.id]: { w, h } }));
                  }}
                  onLongPress={() => {
                    if (layer.locked) return;
                    setSelectedId(layer.id);
                  }}
                  onDoubleTap={() => {
                    if (layer.locked) return;
                    if (layer.type === "text") setEditingText(layer as TextLayer);
                    else if (layer.type === "image") setEditingMaskId(layer.id);
                    // shapes: double-tap selects + nothing extra
                  }}
                  onDuplicate={() => duplicateLayer(layer.id)}
                  onDelete={() => removeLayer(layer.id)}
                  onEditText={() => {
                    if (layer.type === "text") setEditingText(layer as TextLayer);
                    else if (layer.type === "image") setEditingMaskId(layer.id);
                    // shapes: no-op for pencil (selecting already shows toolbar)
                  }}
                  canvasW={project.canvasWidth}
                  canvasH={project.canvasHeight}
                  onSnap={(h, v, outside) => {
                    setSnapH(h);
                    setSnapV(v);
                    setOutsideSafe(outside);
                  }}
                  canvasScale={canvasArea.scale}
                />
              ))}

            {/* Guides shown only at display via separate overlay below */}
          </View>

          {/* Guide overlays in display coords (not captured) */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {/* Safe margins */}
            <View
              style={{
                position: "absolute",
                left: canvasArea.w * SAFE_MARGIN_RATIO,
                top: canvasArea.h * SAFE_MARGIN_RATIO,
                right: canvasArea.w * SAFE_MARGIN_RATIO,
                bottom: canvasArea.h * SAFE_MARGIN_RATIO,
                borderWidth: 1,
                borderColor: outsideSafe ? "rgba(220,53,69,0.5)" : "rgba(108,117,125,0.18)",
                borderStyle: "dashed",
              }}
            />
            {snapV ? (
              <View
                style={{
                  position: "absolute",
                  left: canvasArea.w / 2 - 0.5,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: "#0A5C36",
                }}
              />
            ) : null}
            {snapH ? (
              <View
                style={{
                  position: "absolute",
                  top: canvasArea.h / 2 - 0.5,
                  left: 0,
                  right: 0,
                  height: 1,
                  backgroundColor: "#0A5C36",
                }}
              />
            ) : null}
          </View>

          {/* Selection box + handles (screen-space) — handles stay constant size in dp */}
          {selected && !editingMaskId && !selected.locked && (
            <SelectionBox
              layer={selected}
              canvasW={project.canvasWidth}
              canvasH={project.canvasHeight}
              canvasFrameW={canvasArea.w}
              canvasFrameH={canvasArea.h}
              canvasScale={canvasArea.scale}
              measuredTextSizes={measuredSizes}
              onDelete={() => removeLayer(selected.id)}
              onDuplicate={() => duplicateLayer(selected.id)}
              onEditText={() => {
                if (selected.type === "text") setEditingText(selected as TextLayer);
                else if (selected.type === "image") setEditingMaskId(selected.id);
              }}
              onChange={(patch, record) => updateLayer(selected.id, patch, record)}
            />
          )}
          </View>
        </GestureDetector>

        {/* Eyedropper overlay (V2) — tap-to-pick, Photoshop-style.
            Hover/drag shows a live magnified preview, tap commits the
            color and surfaces the action sheet. */}
        {eyedropperActive && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: canvasArea.w,
                height: canvasArea.h,
                position: "relative",
              }}
            >
              <GestureDetector gesture={eyedropPan}>
                <View
                  style={{
                    width: canvasArea.w,
                    height: canvasArea.h,
                    backgroundColor: "rgba(0,0,0,0.001)",
                    cursor: "crosshair" as any,
                  }}
                  testID="eyedropper-overlay"
                />
              </GestureDetector>
              {eyedropPos && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.eyedropIndicator,
                    {
                      left: eyedropPos.x - 36,
                      top: eyedropPos.y - 90,
                      backgroundColor: eyedropReady ? eyedropColor : "#ffffff",
                    },
                  ]}
                >
                  <View style={styles.eyedropInner}>
                    <Ionicons
                      name="color-wand"
                      size={20}
                      color={pickIconColor(eyedropColor)}
                    />
                  </View>
                  {!eyedropReady && (
                    <View style={styles.eyedropLoading}>
                      <Text style={styles.eyedropLoadingText}>…</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            <View style={styles.eyedropperHint} pointerEvents="none">
              <Ionicons name="color-wand" size={14} color="#fff" />
              <Text style={styles.eyedropperHintText}>
                {eyedropReady
                  ? "اضغط على أي بكسل لالتقاط اللون"
                  : "...جاري التقاط شاشة التصميم"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.eyedropperCancel}
              onPress={cancelEyedropper}
              testID="eyedropper-cancel"
            >
              <Text style={styles.eyedropperCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        )}

        {outsideSafe ? (
          <View style={styles.safeWarn}>
            <Ionicons name="warning" size={14} color={colors.danger} />
            <Text style={styles.safeWarnText}>خارج المنطقة الآمنة</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom contextual toolbar (hidden in mask-edit mode) */}
      {!editingMaskId && (
        <BottomToolbar
          layer={selected}
          project={project}
          onChange={(patch, record) => selected && updateLayer(selected.id, patch, record)}
          onDelete={() => selected && removeLayer(selected.id)}
          onDuplicate={() => selected && duplicateLayer(selected.id)}
          onEditText={() => selected?.type === "text" && setEditingText(selected as TextLayer)}
          onEditImageInside={() => {
            // New behaviour: open the rectangle-clipping crop modal.
            if (selected?.type === "image") setCroppingImageId(selected.id);
          }}
          onReplaceBackground={replaceBackground}
          onReplaceImage={() => selected?.type === "image" && replaceImageLayer(selected.id)}
          onStartEyedropper={startEyedropper}
          bottomInset={insets.bottom}
        />
      )}

      {/* Mask-edit Done bar */}
      {editingMaskId && (
        <View style={[styles.maskEditBar, { paddingBottom: insets.bottom + 12 }]} testID="mask-edit-bar">
          <Text style={styles.maskEditHint}>اسحب الصورة داخل الإطار، استخدم إصبعين للتكبير</Text>
          <TouchableOpacity
            style={styles.maskDoneBtn}
            onPress={() => setEditingMaskId(null)}
            testID="mask-done-btn"
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.maskDoneText}>تم</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating add button (hidden in mask edit) */}
      {!editingMaskId && (
        <TouchableOpacity
          style={[styles.addFab, { bottom: insets.bottom + 110 }]}
          onPress={() => setShowAddSheet(true)}
          testID="add-layer-fab"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add Layer Sheet */}
      <AddLayerSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAddText={addTextLayer}
        onAddImage={addImageLayer}
        onAddShape={addShapeLayer}
        onAddDynamicField={
          project.kind === "booking_template" ? addDynamicFieldLayer : undefined
        }
      />

      {/* Variable picker — appears only after the user chooses "+ حقل
       *  ديناميكي" inside a booking-template project. */}
      <VariablePickerModal
        visible={showVariablePicker}
        onClose={() => setShowVariablePicker(false)}
        onPick={handlePickedVariable}
      />

      {/* Image-field dimensions prompt — appears only when the user
       *  picks an image-type variable. Asks how big the placeholder
       *  should be (can be edited later by selecting + resizing the
       *  layer like any other). */}
      <ImageFieldSizeModal
        visible={pendingImageVar !== null}
        canvasWidth={project?.canvasWidth ?? 1080}
        canvasHeight={project?.canvasHeight ?? 1080}
        variableLabel={pendingImageVar?.variableLabel ?? ""}
        onClose={() => setPendingImageVar(null)}
        onConfirm={handlePickedImageSize}
      />

      {/* Layers Panel */}
      <LayersPanel
        visible={showLayersPanel}
        onClose={() => setShowLayersPanel(false)}
        project={project}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onUpdateProject={updateProject}
      />

      {/* Text edit modal */}
      <TextEditModal
        layer={
          // Use the LIVE layer from project.layers (not the stale snapshot in
          // `editingText` state). Otherwise color/bold/italic patches won't
          // reflect inside the input while the modal is open.
          editingText
            ? ((project.layers.find((l) => l.id === editingText.id && l.type === "text") as
                | TextLayer
                | undefined) ?? editingText)
            : null
        }
        onClose={() => {
          // If the user closed without typing anything, drop the empty text layer.
          if (editingText && (!editingText.text || editingText.text.trim() === "")) {
            const currentLayer = project.layers.find((l) => l.id === editingText.id) as TextLayer | undefined;
            if (currentLayer && (!currentLayer.text || currentLayer.text.trim() === "")) {
              removeLayer(editingText.id);
            }
          }
          setEditingText(null);
        }}
        onSave={(text) => {
          if (editingText) {
            if (text.trim() === "") {
              removeLayer(editingText.id);
            } else {
              updateLayer(editingText.id, { text });
            }
          }
          setEditingText(null);
        }}
        onPatch={(patch) => {
          if (editingText) updateLayer(editingText.id, patch as Partial<AnyLayer>, false);
        }}
      />

      {/* Rectangle-clipping image crop modal */}
      <ImageCropModal
        visible={!!croppingImageId}
        layer={
          (croppingImageId
            ? (project.layers.find((l) => l.id === croppingImageId) as ImageLayer | undefined)
            : null) ?? null
        }
        onCancel={() => setCroppingImageId(null)}
        onApply={(patch) => {
          if (croppingImageId) updateLayer(croppingImageId, patch as Partial<AnyLayer>, true);
          setCroppingImageId(null);
        }}
      />

      {/* Picked color action sheet — shown after a successful eyedropper pick */}
      <PickedColorSheet
        color={pickedColor}
        canApplyToSelected={!!selectedId}
        onDismiss={() => setPickedColor(null)}
        onApplyToSelected={(hex) => {
          applyPickedToSelectedLayer(hex);
          setPickedColor(null);
        }}
        onSaveToBrand={async (hex) => {
          await saveToBrandColors(hex);
          setPickedColor(null);
        }}
      />

      {/* Rename modal */}
      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenaming(false)} />
        <View style={styles.renameBox}>
          <Text style={styles.renameTitle}>اسم المشروع</Text>
          <TextInput
            style={styles.renameInput}
            value={nameInput}
            onChangeText={setNameInput}
            autoFocus
            testID="project-name-input"
          />
          <View style={{ flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity
              style={[styles.renameBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                const v = nameInput.trim();
                if (v) updateProject((p) => ({ ...p, name: v }));
                setRenaming(false);
              }}
              testID="save-name-btn"
            >
              <Text style={styles.renameBtnText}>حفظ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.renameBtn, { backgroundColor: colors.surface }]}
              onPress={() => setRenaming(false)}
            >
              <Text style={[styles.renameBtnText, { color: colors.textPrimary }]}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* -------------------- LayerView with gestures -------------------- */

function LayerView({
  layer,
  isSelected,
  isEditingMask,
  onSelect,
  onChange,
  onMeasured,
  onLongPress,
  onDoubleTap,
  canvasW,
  canvasH,
  onSnap,
  canvasScale,
  onDuplicate,
  onDelete,
  onEditText,
}: {
  layer: AnyLayer;
  isSelected: boolean;
  isEditingMask: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
  onMeasured: (w: number, h: number) => void;
  onLongPress: () => void;
  onDoubleTap: () => void;
  canvasW: number;
  canvasH: number;
  onSnap: (h: boolean, v: boolean, outside: boolean) => void;
  canvasScale: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditText: () => void;
}) {
  const x = useSharedValue(layer.x);
  const y = useSharedValue(layer.y);
  const scale = useSharedValue(layer.scale);
  const rotation = useSharedValue(layer.rotation);
  // image-inside-mask mode shared values
  const offX = useSharedValue(layer.type === "image" ? layer.offsetX : 0);
  const offY = useSharedValue(layer.type === "image" ? layer.offsetY : 0);
  const imgScale = useSharedValue(layer.type === "image" ? layer.imageScale : 1);

  // Measured size for text (canvas units). Defaults are reasonable estimates.
  const [textSize, setTextSize] = useState({ w: 0, h: 0 });

  // Tracks whether ANY gesture on this layer is currently active. While true, we
  // do NOT rubber-band shared values back to layer props — otherwise the 60fps
  // live-state updates from gestures would constantly fight the gesture itself.
  const isGestureActive = useRef(false);
  // Sync shared values from layer props ONLY when a gesture is NOT in flight.
  // External callers (toolbar, undo, selection-box handles) can still update
  // layer state and the shared values will catch up between gestures.
  useEffect(() => {
    if (isGestureActive.current) return;
    x.value = layer.x;
    y.value = layer.y;
    scale.value = layer.scale;
    rotation.value = layer.rotation;
    if (layer.type === "image") {
      offX.value = layer.offsetX;
      offY.value = layer.offsetY;
      imgScale.value = layer.imageScale;
    }
  }, [layer, x, y, scale, rotation, offX, offY, imgScale]);

  const setGestureActive = useCallback((active: boolean) => {
    isGestureActive.current = active;
  }, []);

  // Intrinsic bounding box in canvas units (no scale applied)
  const bboxW =
    layer.type === "image"
      ? layer.maskWidth
      : layer.type === "shape"
        ? layer.width
        : layer.type === "dynamic_field"
          ? layer.width
          : Math.max(textSize.w, 1);
  const bboxH =
    layer.type === "image"
      ? layer.maskHeight
      : layer.type === "shape"
        ? layer.height
        : layer.type === "dynamic_field"
          ? layer.height
          : Math.max(textSize.h, 1);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRot = useSharedValue(0);
  const startOffX = useSharedValue(0);
  const startOffY = useSharedValue(0);
  const startImgScale = useSharedValue(1);

  const finalizePos = useCallback(
    (nx: number, ny: number) => {
      const safeMin = SAFE_MARGIN_RATIO;
      const outside =
        nx < canvasW * safeMin ||
        nx > canvasW * (1 - safeMin) ||
        ny < canvasH * safeMin ||
        ny > canvasH * (1 - safeMin);
      onChange({ x: nx, y: ny } as Partial<AnyLayer>, true);
      onSnap(false, false, outside);
    },
    [onChange, onSnap, canvasW, canvasH],
  );

  // Live snap + live state sync for selection box. Updates layer.x/y/scale/rotation on
  // every frame so the screen-space SelectionBox tracks the gesture in real-time.
  const liveSnap = useCallback(
    (nx: number, ny: number) => {
      const cx = canvasW / 2;
      const cy = canvasH / 2;
      const sV = Math.abs(nx - cx) < SNAP_THRESHOLD_PX;
      const sH = Math.abs(ny - cy) < SNAP_THRESHOLD_PX;
      const safeMin = SAFE_MARGIN_RATIO;
      const outside =
        nx < canvasW * safeMin ||
        nx > canvasW * (1 - safeMin) ||
        ny < canvasH * safeMin ||
        ny > canvasH * (1 - safeMin);
      onSnap(sH, sV, outside);
    },
    [canvasW, canvasH, onSnap],
  );

  const livePos = useCallback(
    (nx: number, ny: number) => {
      onChange({ x: nx, y: ny } as Partial<AnyLayer>, false);
    },
    [onChange],
  );
  const liveScale = useCallback(
    (s: number) => onChange({ scale: s } as Partial<AnyLayer>, false),
    [onChange],
  );
  const liveRotation = useCallback(
    (deg: number) => onChange({ rotation: deg } as Partial<AnyLayer>, false),
    [onChange],
  );

  // --- Whole-layer gestures (normal mode) ---
  const pan = Gesture.Pan()
    .enabled(!layer.locked && !isEditingMask)
    .minDistance(2)
    .onBegin(() => {
      runOnJS(setGestureActive)(true);
      // Select immediately on touch so a single tap also selects.
      runOnJS(onSelect)();
    })
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      const cx = canvasW / 2;
      const cy = canvasH / 2;
      let nx = startX.value + e.translationX / canvasScale;
      let ny = startY.value + e.translationY / canvasScale;
      if (Math.abs(nx - cx) < SNAP_THRESHOLD_PX) nx = cx;
      if (Math.abs(ny - cy) < SNAP_THRESHOLD_PX) ny = cy;
      x.value = nx;
      y.value = ny;
      runOnJS(liveSnap)(nx, ny);
      runOnJS(livePos)(nx, ny);
    })
    .onEnd(() => {
      runOnJS(finalizePos)(x.value, y.value);
    })
    .onFinalize(() => {
      runOnJS(setGestureActive)(false);
    });

  const pinch = Gesture.Pinch()
    .enabled(!layer.locked && !isEditingMask)
    .onBegin(() => {
      runOnJS(setGestureActive)(true);
    })
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const s = Math.max(0.1, Math.min(10, startScale.value * e.scale));
      scale.value = s;
      runOnJS(liveScale)(s);
    })
    .onEnd(() => {
      runOnJS(onChange)({ scale: scale.value } as Partial<AnyLayer>, true);
    })
    .onFinalize(() => {
      runOnJS(setGestureActive)(false);
    });

  const rotate = Gesture.Rotation()
    .enabled(!layer.locked && !isEditingMask)
    .onBegin(() => {
      runOnJS(setGestureActive)(true);
    })
    .onStart(() => {
      startRot.value = rotation.value;
    })
    .onUpdate((e) => {
      let deg = startRot.value + (e.rotation * 180) / Math.PI;
      // Snap to the nearest 45° if within ±5°.
      const SNAP_STEP = 45;
      const SNAP_TOL = 5;
      const nearest = Math.round(deg / SNAP_STEP) * SNAP_STEP;
      if (Math.abs(deg - nearest) < SNAP_TOL) deg = nearest;
      rotation.value = deg;
      runOnJS(liveRotation)(deg);
    })
    .onEnd(() => {
      runOnJS(onChange)({ rotation: rotation.value } as Partial<AnyLayer>, true);
    })
    .onFinalize(() => {
      runOnJS(setGestureActive)(false);
    });

  const tap = Gesture.Tap()
    .maxDuration(280)
    .onEnd(() => {
      runOnJS(onSelect)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onDoubleTap)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(420)
    .onStart(() => {
      runOnJS(onLongPress)();
    });

  // --- Image-inside-mask gestures (edit mode) ---
  const panMask = Gesture.Pan()
    .enabled(isEditingMask && layer.type === "image")
    .minDistance(4)
    .averageTouches(true)
    .onStart(() => {
      startOffX.value = offX.value;
      startOffY.value = offY.value;
    })
    .onUpdate((e) => {
      offX.value = startOffX.value + e.translationX / canvasScale;
      offY.value = startOffY.value + e.translationY / canvasScale;
    })
    .onEnd(() => {
      runOnJS(onChange)(
        { offsetX: Math.round(offX.value), offsetY: Math.round(offY.value) } as Partial<AnyLayer>,
        true,
      );
    });

  const pinchMask = Gesture.Pinch()
    .enabled(isEditingMask && layer.type === "image")
    .onStart(() => {
      startImgScale.value = imgScale.value;
    })
    .onUpdate((e) => {
      const s = Math.max(0.1, Math.min(8, startImgScale.value * e.scale));
      imgScale.value = s;
    })
    .onEnd(() => {
      runOnJS(onChange)({ imageScale: imgScale.value } as Partial<AnyLayer>, true);
    });

  const composedNormal = Gesture.Race(
    Gesture.Simultaneous(pan, pinch, rotate),
    doubleTap,
    longPress,
    tap,
  );
  const composedMask = Gesture.Simultaneous(panMask, pinchMask);
  const composed = isEditingMask ? composedMask : composedNormal;

  // -----------------------------------------------------------------------
  //  Layer transform model (touch-friendly AND geometrically correct)
  //
  //  Animated.View has no explicit width/height — it auto-sizes to its
  //  children (≈ bboxW × bboxH). That gives it real native bounds, so
  //  Android's hit-test can deliver touches to the visible content.
  //
  //  The transform array offsets by (layer.x − bboxW/2, layer.y − bboxH/2)
  //  BEFORE scale & rotate. Because scale/rotate orbit the view's layout
  //  center (bboxW/2, bboxH/2 of its own bounds), the post-transform
  //  visible center sits EXACTLY at (layer.x, layer.y) for any scale /
  //  rotation. → No drift, no off-center scaling, snap markers stay
  //  aligned with the layer's actual center.
  // -----------------------------------------------------------------------
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - bboxW / 2 },
      { translateY: y.value - bboxH / 2 },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  // Re-rendered when image layer offsets change (mask preview)
  const imageAnimStyle = useAnimatedStyle(() => {
    if (layer.type !== "image") return {};
    const w = bboxW;
    const h = bboxH;
    const iw = layer.width * imgScale.value;
    const ih = layer.height * imgScale.value;
    return {
      position: "absolute",
      left: (w - iw) / 2 + offX.value,
      top: (h - ih) / 2 + offY.value,
      width: iw,
      height: ih,
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            opacity: layer.opacity,
            zIndex: layer.zIndex,
          },
          animatedStyle,
        ]}
        testID={`layer-${layer.id}`}
      >
        {/* The Animated.View's outer transform already positions and centers
            the content at (layer.x, layer.y). No inner shift is needed. */}
        <View>
          {/* For image layers in mask-edit mode, render mask with live-animated inner image */}
          {isEditingMask && layer.type === "image" ? (
            <View
              style={{
                width: bboxW,
                height: bboxH,
                borderRadius: (layer as ImageLayer).borderRadius,
                overflow: "hidden",
              }}
            >
              <Animated.View style={imageAnimStyle}>
                <ExpoImage
                  source={{ uri: (layer as ImageLayer).uri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="fill"
                />
              </Animated.View>
            </View>
          ) : (
            <LayerRenderer
              layer={layer}
              displayScale={1}
              onMeasured={
                layer.type === "text"
                  ? (w, h) => {
                      setTextSize((prev) =>
                        Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5
                          ? prev
                          : { w, h },
                      );
                      onMeasured(w, h);
                    }
                  : undefined
              }
            />
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}


/* -------------------- Bottom Toolbar -------------------- */

function BottomToolbar({
  layer,
  project,
  onChange,
  onDelete,
  onDuplicate,
  onEditText,
  onEditImageInside,
  onReplaceBackground,
  onReplaceImage,
  onStartEyedropper,
  bottomInset,
}: {
  layer: AnyLayer | null;
  project: Project;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditText: () => void;
  onEditImageInside: () => void;
  onReplaceBackground: () => void;
  onReplaceImage: () => void;
  onStartEyedropper: () => void;
  bottomInset: number;
}) {
  if (!layer) {
    return (
      <View style={[styles.toolbar, { paddingBottom: bottomInset + 12 }]} testID="toolbar-empty">
        <View style={{ flex: 1 }}>
          <Text style={styles.toolbarHint}>اضغط على عنصر للتحرير، أو + لإضافة طبقة جديدة</Text>
        </View>
        <TouchableOpacity
          style={styles.toolbarSmallBtn}
          onPress={onReplaceBackground}
          testID="replace-bg-btn"
        >
          <Ionicons name="image-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.toolbarSmallBtnText}>الخلفية</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.toolbar, { paddingBottom: bottomInset + 12 }]} testID={`toolbar-${layer.type}`}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarRow}>
        {layer.type === "text" && (
          <TextToolbar
            layer={layer as TextLayer}
            onChange={onChange}
            onEditText={onEditText}
            onStartEyedropper={onStartEyedropper}
          />
        )}
        {layer.type === "image" && (
          <ImageToolbar
            layer={layer as ImageLayer}
            onChange={onChange}
            onEditImageInside={onEditImageInside}
            onReplaceImage={onReplaceImage}
          />
        )}
        {layer.type === "shape" && <ShapeToolbar layer={layer as ShapeLayer} onChange={onChange} />}
        <View style={styles.toolDivider} />
        <ToolButton
          icon="copy-outline"
          label="تكرار"
          onPress={onDuplicate}
          testID="tool-duplicate"
        />
        <ToolButton icon="trash-outline" label="حذف" onPress={onDelete} testID="tool-delete" danger />
      </ScrollView>
    </View>
  );
}

function TextToolbar({
  layer,
  onChange,
  onEditText,
  onStartEyedropper,
}: {
  layer: TextLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
  onEditText: () => void;
  onStartEyedropper: () => void;
}) {
  const [showFontSheet, setShowFontSheet] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const [showSize, setShowSize] = useState(false);
  const [showLine, setShowLine] = useState(false);

  return (
    <>
      <ToolButton icon="create-outline" label="تحرير النص" onPress={onEditText} testID="tool-edit-text" />
      <ToolButton icon="text" label="الخط" onPress={() => setShowFontSheet(true)} testID="tool-font" />
      <ToolButton icon="resize-outline" label="الحجم" onPress={() => setShowSize(true)} testID="tool-size" />
      <ToolButton
        icon="color-palette-outline"
        label="اللون"
        onPress={() => setShowColor(true)}
        testID="tool-color"
        tint={layer.color}
      />
      {/* Eyedropper — pick a color from anywhere on screen (web) /
          from the canvas (native) and apply to this text's color. */}
      <ToolButton
        icon={<Ionicons name="eyedrop" size={20} color={colors.primary} />}
        label="قطّارة"
        onPress={onStartEyedropper}
        testID="tool-text-eyedropper"
      />
      <BoldItalicToolButton
        label="B"
        labelStyle={{ fontWeight: "900" }}
        onPress={() => onChange({ bold: !layer.bold } as Partial<AnyLayer>)}
        testID="tool-bold"
        active={layer.bold}
        accessibilityLabel="عريض"
      />
      <BoldItalicToolButton
        label="I"
        labelStyle={{ fontStyle: "italic", fontWeight: "600" }}
        onPress={() => onChange({ italic: !layer.italic } as Partial<AnyLayer>)}
        testID="tool-italic"
        active={layer.italic}
        accessibilityLabel="مائل"
      />
      <ToolButton
        icon="reorder-three-outline"
        label="المسافة"
        onPress={() => setShowLine(true)}
        testID="tool-linespacing"
      />
      <ToolButton
        icon={
          layer.align === "right" ? "menu" : layer.align === "left" ? "menu-outline" : "reorder-four"
        }
        label="محاذاة"
        onPress={() => {
          const seq: TextLayer["align"][] = ["right", "center", "left"];
          const next = seq[(seq.indexOf(layer.align) + 1) % seq.length];
          onChange({ align: next } as Partial<AnyLayer>);
        }}
        testID="tool-align"
      />
      <ToolButton
        icon="swap-horizontal"
        label={
          layer.direction === "rtl"
            ? "RTL"
            : layer.direction === "ltr"
              ? "LTR"
              : isRTLText(layer.text)
                ? "تلقائي ←"
                : "تلقائي →"
        }
        onPress={() => {
          const seq: TextLayer["direction"][] = ["auto", "rtl", "ltr"];
          const next = seq[(seq.indexOf(layer.direction) + 1) % seq.length];
          onChange({ direction: next } as Partial<AnyLayer>);
        }}
        testID="tool-direction"
      />
      <OpacityTool layer={layer} onChange={onChange} />

      {/* Font sheet */}
      <PickerSheet
        visible={showFontSheet}
        onClose={() => setShowFontSheet(false)}
        title="اختر الخط"
      >
        {ARABIC_SAFE_FONTS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[
              styles.pickerRow,
              layer.fontFamily === f.id && { backgroundColor: colors.primaryLight },
            ]}
            onPress={() => {
              onChange({ fontFamily: f.id } as Partial<AnyLayer>);
              setShowFontSheet(false);
            }}
            testID={`font-${f.id}`}
          >
            <Text style={[styles.pickerRowText, { fontFamily: f.id }]}>{f.label} — نص</Text>
          </TouchableOpacity>
        ))}
      </PickerSheet>

      <SliderSheet
        visible={showSize}
        onClose={() => setShowSize(false)}
        title="حجم الخط"
        min={10}
        max={300}
        value={layer.fontSize}
        onChange={(v) => onChange({ fontSize: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ fontSize: Math.round(v) } as Partial<AnyLayer>, true)}
      />

      <SliderSheet
        visible={showLine}
        onClose={() => setShowLine(false)}
        title="تباعد الأسطر"
        min={0.8}
        max={3}
        step={0.05}
        value={layer.lineHeight}
        onChange={(v) => onChange({ lineHeight: v } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ lineHeight: v } as Partial<AnyLayer>, true)}
      />

      <ColorPickerSheet
        visible={showColor}
        onClose={() => setShowColor(false)}
        value={layer.color}
        onChange={(c) => onChange({ color: c } as Partial<AnyLayer>)}
      />
    </>
  );
}

function ImageToolbar({
  layer,
  onChange,
  onEditImageInside,
  onReplaceImage,
}: {
  layer: ImageLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
  onEditImageInside: () => void;
  onReplaceImage: () => void;
}) {
  const [showRadius, setShowRadius] = useState(false);
  const [showFrame, setShowFrame] = useState(false);
  const [showBorderColor, setShowBorderColor] = useState(false);
  const [showBorderWidth, setShowBorderWidth] = useState(false);
  // Collage-only sheets
  const [showCollageLayout, setShowCollageLayout] = useState(false);
  const [showCollageGap, setShowCollageGap] = useState(false);
  const [showCollageCellRadius, setShowCollageCellRadius] = useState(false);
  const [showCollageBg, setShowCollageBg] = useState(false);

  const isCollage = !!(layer.collageImages && layer.collageImages.length >= 2);
  const [showCellEditor, setShowCellEditor] = useState(false);

  const applyAspectRatio = useCallback(
    (opt: AspectRatioOption) => {
      // Keep the larger of mask w/h, shrink other to match ratio.
      const targetRatio = opt.width / opt.height;
      const curMax = Math.max(layer.maskWidth, layer.maskHeight);
      let mw: number, mh: number;
      if (targetRatio >= 1) {
        mw = curMax;
        mh = mw / targetRatio;
      } else {
        mh = curMax;
        mw = mh * targetRatio;
      }
      mw = Math.max(50, Math.round(mw));
      mh = Math.max(50, Math.round(mh));
      // Cover-fit image inside new mask.
      const imageScale = Math.max(mw / layer.width, mh / layer.height);
      onChange(
        { maskWidth: mw, maskHeight: mh, imageScale, offsetX: 0, offsetY: 0 } as Partial<AnyLayer>,
        true,
      );
    },
    [layer.maskWidth, layer.maskHeight, layer.width, layer.height, onChange],
  );

  return (
    <>
      {/* ─────────── Collage controls (only visible in collage mode) ─────────── */}
      {isCollage && (
        <>
          <ToolButton
            icon="grid-outline"
            label={`شكل (${layer.collageImages?.length || 0})`}
            onPress={() => setShowCollageLayout(true)}
            testID="tool-collage-layout"
          />
          <ToolButton
            icon="brush"
            label="تحرير الصور"
            onPress={() => setShowCellEditor(true)}
            testID="tool-collage-edit-cells"
          />
          <ToolButton
            icon="resize"
            label="المسافات"
            onPress={() => setShowCollageGap(true)}
            testID="tool-collage-gap"
          />
          <ToolButton
            icon="ellipse-outline"
            label="حواف الصور"
            onPress={() => setShowCollageCellRadius(true)}
            testID="tool-collage-cell-radius"
          />
          <ToolButton
            icon="color-palette-outline"
            label="خلفية الكولاج"
            tint={layer.collageBackgroundColor || "#FFFFFF"}
            onPress={() => setShowCollageBg(true)}
            testID="tool-collage-bg"
          />
          <View style={styles.toolDivider} />
        </>
      )}

      <ToolButton
        icon="image-outline"
        label="استبدال الصورة"
        onPress={onReplaceImage}
        testID="tool-replace-image"
      />
      <ToolButton
        icon="crop-outline"
        label="اقتصاص"
        onPress={onEditImageInside}
        testID="tool-edit-image-inside"
      />
      <ToolButton
        icon="swap-horizontal-outline"
        label="قلب أفقي"
        onPress={() => onChange({ flipX: !layer.flipX } as Partial<AnyLayer>)}
        testID="tool-flip-x"
        active={!!layer.flipX}
      />
      <ToolButton
        icon="swap-vertical-outline"
        label="قلب عمودي"
        onPress={() => onChange({ flipY: !layer.flipY } as Partial<AnyLayer>)}
        testID="tool-flip-y"
        active={!!layer.flipY}
      />
      <ToolButton
        icon="scan-outline"
        label="نسبة الإطار"
        onPress={() => setShowFrame(true)}
        testID="tool-frame"
      />
      <ToolButton
        icon={layer.borderRadius > 0 ? "square-outline" : "ellipse-outline"}
        label="حواف"
        onPress={() => setShowRadius(true)}
        testID="tool-radius"
      />
      <ToolButton
        icon="square"
        label="إطار"
        tint={layer.borderWidth > 0 ? layer.borderColor : undefined}
        onPress={() => setShowBorderColor(true)}
        testID="tool-border-color"
      />
      <ToolButton
        icon="git-commit-outline"
        label="سُمك الإطار"
        onPress={() => setShowBorderWidth(true)}
        testID="tool-border-width"
      />
      <OpacityTool layer={layer} onChange={onChange} />

      <SliderSheet
        visible={showRadius}
        onClose={() => setShowRadius(false)}
        title="انحناء الحواف"
        min={0}
        max={Math.min(layer.maskWidth, layer.maskHeight) / 2}
        value={layer.borderRadius}
        onChange={(v) => onChange({ borderRadius: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ borderRadius: Math.round(v) } as Partial<AnyLayer>, true)}
      />

      <ColorPickerSheet
        visible={showBorderColor}
        onClose={() => setShowBorderColor(false)}
        value={layer.borderColor || "#FFFFFF"}
        onChange={(c) => onChange({ borderColor: c } as Partial<AnyLayer>)}
      />

      <SliderSheet
        visible={showBorderWidth}
        onClose={() => setShowBorderWidth(false)}
        title="سُمك الإطار"
        min={0}
        max={50}
        value={layer.borderWidth || 0}
        onChange={(v) => onChange({ borderWidth: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ borderWidth: Math.round(v) } as Partial<AnyLayer>, true)}
      />

      <FrameAspectSheet
        visible={showFrame}
        onClose={() => setShowFrame(false)}
        layer={layer}
        onSelect={(opt) => {
          applyAspectRatio(opt);
          setShowFrame(false);
        }}
      />

      {/* ─────────── Collage sheets ─────────── */}
      {isCollage && (
        <>
          <CollageLayoutSheet
            visible={showCollageLayout}
            onClose={() => setShowCollageLayout(false)}
            count={layer.collageImages?.length || 0}
            current={layer.collageLayout || "auto"}
            onSelect={(l) => {
              onChange({ collageLayout: l } as Partial<AnyLayer>, true);
              setShowCollageLayout(false);
            }}
          />
          <SliderSheet
            visible={showCollageGap}
            onClose={() => setShowCollageGap(false)}
            title="المسافة بين الصور"
            min={0}
            max={40}
            value={layer.collageGap ?? 8}
            onChange={(v) => onChange({ collageGap: Math.round(v) } as Partial<AnyLayer>, false)}
            onCommit={(v) => onChange({ collageGap: Math.round(v) } as Partial<AnyLayer>, true)}
          />
          <SliderSheet
            visible={showCollageCellRadius}
            onClose={() => setShowCollageCellRadius(false)}
            title="انحناء حواف الصور"
            min={0}
            max={60}
            value={layer.collageCellRadius ?? 8}
            onChange={(v) =>
              onChange({ collageCellRadius: Math.round(v) } as Partial<AnyLayer>, false)
            }
            onCommit={(v) =>
              onChange({ collageCellRadius: Math.round(v) } as Partial<AnyLayer>, true)
            }
          />
          <ColorPickerSheet
            visible={showCollageBg}
            onClose={() => setShowCollageBg(false)}
            value={layer.collageBackgroundColor || "#FFFFFF"}
            onChange={(c) => onChange({ collageBackgroundColor: c } as Partial<AnyLayer>)}
          />
          <CollageCellEditorModal
            visible={showCellEditor}
            onClose={() => setShowCellEditor(false)}
            layer={layer}
            onChange={onChange}
          />
        </>
      )}
    </>
  );
}

/* -------------------- Collage Layout Picker Sheet (visual previews) -------------------- */

/** Recursive shape renderer used inside the layout-picker thumbnails.
 *  Mirrors CollageRenderer's ShapeNode but renders solid color blocks
 *  instead of images so the user can see the structure at a glance. */
function ShapeMini({
  shape,
  fill,
  empty,
  cellLimit,
  thinGap,
}: {
  shape: CollageShape;
  fill: string;
  empty: string;
  cellLimit: number;
  thinGap: number;
}) {
  if (typeof shape === "number") {
    const filled = shape < cellLimit;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: filled ? fill : empty,
          borderRadius: 2,
        }}
      />
    );
  }
  return (
    <View
      style={{
        flex: 1,
        flexDirection: shape.direction,
        gap: thinGap,
      }}
    >
      {shape.items.map((child, i) => (
        <ShapeMini
          key={i}
          shape={child}
          fill={fill}
          empty={empty}
          cellLimit={cellLimit}
          thinGap={thinGap}
        />
      ))}
    </View>
  );
}

/** Visually represents a single collage layout — including asymmetric
 *  ones (1-top-2-bottom, 1-left-3-right, …). Walks the same shape tree
 *  the renderer uses to guarantee parity. */
function LayoutIcon({
  layout,
  count,
  active,
}: {
  layout: CollageLayout;
  count: number;
  active: boolean;
}) {
  // Resolve "auto" to a real layout that matches the current count.
  let resolved: Exclude<CollageLayout, "auto">;
  if (layout === "auto") {
    if (count <= 2) resolved = "horizontal-2";
    else if (count === 3) resolved = "horizontal-3";
    else if (count === 4) resolved = "grid-2x2";
    else if (count <= 6) resolved = "grid-3x2";
    else resolved = "grid-3x3";
  } else {
    resolved = layout;
  }
  const def = COLLAGE_LAYOUTS[resolved];
  if (!def) return null;
  const cellColor = active ? colors.primary : colors.textSecondary;

  return (
    <View
      style={{
        width: 56,
        height: 56,
        padding: 4,
        backgroundColor: active ? "#fff" : colors.surface,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.borderSubtle,
      }}
    >
      <ShapeMini
        shape={def.shape}
        fill={cellColor}
        empty="rgba(0,0,0,0.06)"
        cellLimit={Math.min(def.count, count)}
        thinGap={3}
      />
    </View>
  );
}

function CollageLayoutSheet({
  visible,
  onClose,
  count,
  current,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  count: number;
  current: CollageLayout;
  onSelect: (layout: CollageLayout) => void;
}) {
  const insets = useSafeAreaInsets();

  // Strictly filter layouts whose cell count == image count, then
  // prepend the smart "auto" choice. This guarantees no image is ever
  // hidden because the chosen layout has too few cells.
  const exactMatches = useMemo(() => layoutsForCount(count), [count]);
  const opts: Array<{ id: CollageLayout; label: string }> = [
    { id: "auto", label: "تلقائي ✨" },
    ...exactMatches.map((id) => ({ id: id as CollageLayout, label: COLLAGE_LAYOUTS[id].label })),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + 12,
            // Make sheet fully opaque per UX request.
            backgroundColor: "#ffffff",
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>اختر شكل الكولاج</Text>
        <Text style={{ ...styles.toolbarHint, marginBottom: 6 }}>
          {count} {count === 1 ? "صورة" : "صور"} — التخطيطات المطابقة فقط
        </Text>
        {opts.length <= 1 ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <Ionicons name="information-circle-outline" size={28} color={colors.textSecondary} />
            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: colors.textSecondary,
                textAlign: "center",
              }}
            >
              لا توجد تخطيطات بالضبط لـ {count} صور. استخدم "تلقائي" أو أضف/احذف صورة.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: "row-reverse",
              gap: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            {opts.map((o) => {
              const active = current === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => onSelect(o.id)}
                  style={{ alignItems: "center", gap: 6, width: 80 }}
                  testID={`collage-layout-${o.id}`}
                >
                  <LayoutIcon layout={o.id} count={count} active={active} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: active ? colors.primary : colors.textPrimary,
                      fontWeight: active ? "700" : "500",
                      textAlign: "center",
                    }}
                    numberOfLines={1}
                  >
                    {o.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function FrameAspectSheet({
  visible,
  onClose,
  layer,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  layer: ImageLayer;
  onSelect: (opt: AspectRatioOption) => void;
}) {
  const insets = useSafeAreaInsets();
  // Detect current aspect ratio
  const curRatio = layer.maskWidth / layer.maskHeight;
  const selectedId = RATIO_OPTIONS.find(
    (o) => Math.abs(o.width / o.height - curRatio) < 0.02,
  )?.id;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>نسبة الإطار</Text>
        </View>
        <Text style={{ ...styles.toolbarHint, marginBottom: 8 }}>اختر نسبة الأبعاد للإطار</Text>
        <AspectRatioPicker selectedId={selectedId} onSelect={onSelect} variant="row" />
      </View>
    </Modal>
  );
}

function ShapeToolbar({
  layer,
  onChange,
}: {
  layer: ShapeLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
}) {
  const [showFill, setShowFill] = useState(false);
  const [showStroke, setShowStroke] = useState(false);
  const [showStrokeW, setShowStrokeW] = useState(false);
  const [showSize, setShowSize] = useState(false);

  const isOutlineOnly = layer.fillColor === "transparent";

  const toggleStyle = useCallback(() => {
    if (isOutlineOnly) {
      // Switch to filled
      onChange(
        { fillColor: layer.strokeColor && layer.strokeColor !== "transparent" ? layer.strokeColor : "#0A5C36", strokeWidth: 0 } as Partial<AnyLayer>,
        true,
      );
    } else {
      // Switch to outline
      onChange(
        { fillColor: "transparent", strokeColor: layer.fillColor && layer.fillColor !== "transparent" ? layer.fillColor : "#0A5C36", strokeWidth: Math.max(4, layer.strokeWidth) } as Partial<AnyLayer>,
        true,
      );
    }
  }, [isOutlineOnly, layer, onChange]);

  return (
    <>
      <ToolButton
        icon={isOutlineOnly ? "ellipse-outline" : "ellipse"}
        label={isOutlineOnly ? "حدود فقط" : "تعبئة"}
        onPress={toggleStyle}
        testID="tool-style-toggle"
        active={!isOutlineOnly}
      />
      <ToolButton
        icon="color-palette"
        label="تعبئة"
        tint={layer.fillColor !== "transparent" ? layer.fillColor : undefined}
        onPress={() => setShowFill(true)}
        testID="tool-fill"
      />
      <ToolButton
        icon="ellipse-outline"
        label="حدود"
        tint={layer.strokeColor}
        onPress={() => setShowStroke(true)}
        testID="tool-stroke"
      />
      <ToolButton
        icon="git-commit-outline"
        label="سُمك"
        onPress={() => setShowStrokeW(true)}
        testID="tool-stroke-width"
      />
      <ToolButton icon="resize-outline" label="الحجم" onPress={() => setShowSize(true)} testID="tool-shape-size" />
      <OpacityTool layer={layer} onChange={onChange} />

      <ColorPickerSheet
        visible={showFill}
        onClose={() => setShowFill(false)}
        value={layer.fillColor === "transparent" ? "#FFFFFF" : layer.fillColor}
        allowTransparent
        onChange={(c) => onChange({ fillColor: c } as Partial<AnyLayer>)}
      />
      <ColorPickerSheet
        visible={showStroke}
        onClose={() => setShowStroke(false)}
        value={layer.strokeColor}
        onChange={(c) => onChange({ strokeColor: c } as Partial<AnyLayer>)}
      />
      <SliderSheet
        visible={showStrokeW}
        onClose={() => setShowStrokeW(false)}
        title="سُمك الحدود"
        min={0}
        max={50}
        value={layer.strokeWidth}
        onChange={(v) => onChange({ strokeWidth: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ strokeWidth: Math.round(v) } as Partial<AnyLayer>, true)}
      />
      <SliderSheet
        visible={showSize}
        onClose={() => setShowSize(false)}
        title="الحجم"
        min={20}
        max={2000}
        value={layer.width}
        onChange={(v) => {
          const w = Math.round(v);
          const ratio = layer.height / layer.width;
          onChange({ width: w, height: layer.shape === "line" ? layer.height : Math.round(w * ratio) } as Partial<AnyLayer>, false);
        }}
        onCommit={(v) => {
          const w = Math.round(v);
          const ratio = layer.height / layer.width;
          onChange({ width: w, height: layer.shape === "line" ? layer.height : Math.round(w * ratio) } as Partial<AnyLayer>, true);
        }}
      />
    </>
  );
}

function OpacityTool({
  layer,
  onChange,
}: {
  layer: AnyLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <ToolButton
        icon="contrast-outline"
        label="شفافية"
        onPress={() => setShow(true)}
        testID="tool-opacity"
      />
      <SliderSheet
        visible={show}
        onClose={() => setShow(false)}
        title="الشفافية"
        min={0.05}
        max={1}
        step={0.01}
        value={layer.opacity}
        onChange={(v) => onChange({ opacity: v } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ opacity: v } as Partial<AnyLayer>, true)}
      />
    </>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
  testID,
  active,
  danger,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  active?: boolean;
  danger?: boolean;
  tint?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && { backgroundColor: colors.primaryLight }]}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.toolIconWrap}>
        <Ionicons
          name={icon}
          size={22}
          color={danger ? colors.danger : active ? colors.primary : colors.textPrimary}
        />
        {tint ? <View style={[styles.toolTintDot, { backgroundColor: tint }]} /> : null}
      </View>
      <Text
        style={[
          styles.toolLabel,
          { color: danger ? colors.danger : active ? colors.primary : colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Bottom-toolbar variant that displays a single LETTER ("B" / "I") with the
 * appropriate font weight / style, mimicking the universal Bold-Italic icons.
 */
function BoldItalicToolButton({
  label,
  labelStyle,
  onPress,
  testID,
  active,
  accessibilityLabel,
}: {
  label: string;
  labelStyle?: { fontWeight?: string; fontStyle?: "italic" | "normal" };
  onPress: () => void;
  testID?: string;
  active?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && { backgroundColor: colors.primaryLight }]}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.toolIconWrap}>
        <Text
          style={{
            fontSize: 22,
            lineHeight: 24,
            color: active ? colors.primary : colors.textPrimary,
            fontWeight: (labelStyle?.fontWeight as any) ?? "700",
            fontStyle: (labelStyle?.fontStyle as any) ?? "normal",
            fontFamily: fonts.tajawalBold,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.toolLabel,
          { color: active ? colors.primary : colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {accessibilityLabel ?? label}
      </Text>
    </TouchableOpacity>
  );
}

/* -------------------- Add Layer Sheet -------------------- */

function AddLayerSheet({
  visible,
  onClose,
  onAddText,
  onAddImage,
  onAddShape,
  onAddDynamicField,
}: {
  visible: boolean;
  onClose: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddShape: (s: ShapeType) => void;
  /** Only provided when the open project is a booking template. */
  onAddDynamicField?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>إضافة طبقة</Text>
        <View style={{ flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md }}>
          <AddCard icon="text" label="نص" onPress={onAddText} testID="add-text-btn" />
          <AddCard icon="image" label="صورة" onPress={onAddImage} testID="add-image-btn" />
          {onAddDynamicField ? (
            <AddCard
              icon="cube-outline"
              label="حقل ديناميكي"
              onPress={onAddDynamicField}
              testID="add-dynamic-field-btn"
            />
          ) : null}
        </View>
        <Text style={styles.sheetSection}>الأشكال</Text>
        <View style={styles.shapeGrid}>
          {(["rectangle", "rectangle_free", "circle", "triangle", "star", "star4", "star6", "star8", "line"] as ShapeType[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.shapeCard}
              onPress={() => onAddShape(s)}
              testID={`add-shape-${s}`}
            >
              <Ionicons name={shapeIcon(s)} size={28} color={colors.primary} />
              <Text style={styles.shapeLabel}>{shapeLabel(s)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function AddCard({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.addCard} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={28} color={colors.primary} />
      <Text style={styles.addCardLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Choose a readable icon tint for a swatch background — black text on light
 * colors, white on dark colors. Uses the standard luminance formula.
 */
function pickIconColor(hex: string): string {
  if (!hex || hex.length < 7) return "#000";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? "#000" : "#fff";
}


function shapeIcon(s: ShapeType): keyof typeof Ionicons.glyphMap {
  return ({
    rectangle: "square-outline",
    rectangle_free: "square-outline",
    circle: "ellipse-outline",
    triangle: "triangle-outline",
    star: "star-outline",
    star4: "star-outline",
    star6: "star-outline",
    star8: "star-outline",
    line: "remove-outline",
  } as const)[s];
}

function shapeLabel(s: ShapeType): string {
  return ({
    rectangle: "مستطيل",
    rectangle_free: "مستطيل حر",
    circle: "دائرة",
    triangle: "مثلث",
    star: "نجمة 5",
    star4: "نجمة 4",
    star6: "نجمة 6",
    star8: "نجمة 8",
    line: "خط",
  } as const)[s];
}

/* -------------------- Layers Panel -------------------- */

function LayersPanel({
  visible,
  onClose,
  project,
  selectedId,
  onSelect,
  onUpdateProject,
}: {
  visible: boolean;
  onClose: () => void;
  project: Project;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdateProject: (updater: (p: Project) => Project, record?: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  // Top of stack first (highest zIndex first)
  const sorted = [...project.layers].sort((a, b) => b.zIndex - a.zIndex);

  const handleReorder = (orderedIds: string[]) => {
    // orderedIds[0] is now top of stack -> highest zIndex
    const total = orderedIds.length;
    onUpdateProject((p) => ({
      ...p,
      layers: p.layers.map((l) => {
        const idx = orderedIds.indexOf(l.id);
        if (idx < 0) return l;
        return { ...l, zIndex: total - idx };
      }) as AnyLayer[],
    }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "75%" }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose} testID="close-layers-btn">
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>الطبقات</Text>
          </View>
          <Text style={{ ...styles.toolbarHint, marginBottom: 6 }}>
            اضغط مطولاً واسحب لإعادة الترتيب. اضغط طويلاً على الاسم لإعادة التسمية.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={false}>
            <DraggableLayerList
              layers={sorted}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleLock={(id) =>
                onUpdateProject((p) => ({
                  ...p,
                  layers: p.layers.map((x) => (x.id === id ? { ...x, locked: !x.locked } : x)),
                }))
              }
              onToggleVisible={(id) =>
                onUpdateProject((p) => ({
                  ...p,
                  layers: p.layers.map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)),
                }))
              }
              onDelete={(id) =>
                onUpdateProject((p) => ({ ...p, layers: p.layers.filter((x) => x.id !== id) }))
              }
              onRename={(id, name) =>
                onUpdateProject((p) => ({
                  ...p,
                  layers: p.layers.map((x) => (x.id === id ? { ...x, name } : x)),
                }))
              }
              onReorder={handleReorder}
            />
          </ScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* -------------------- Text edit modal -------------------- */

function TextEditModal({
  layer,
  onClose,
  onSave,
  onPatch,
}: {
  layer: TextLayer | null;
  onClose: () => void;
  onSave: (text: string) => void;
  onPatch: (patch: Partial<TextLayer>) => void;
}) {
  const [val, setVal] = useState("");
  const [showColor, setShowColor] = useState(false);
  // Guard against a touch-up event from the same tap that OPENED this modal
  // accidentally hitting the backdrop and closing it immediately. This is
  // a well-known RN+RNGH+Modal issue (the touch-up "leaks" through to the
  // backdrop Pressable rendered at the same screen location).
  const openedAtRef = useRef<number>(0);
  useEffect(() => {
    if (layer) {
      setVal(layer.text);
      openedAtRef.current = Date.now();
    }
  }, [layer]);
  const insets = useSafeAreaInsets();

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < 350) return; // ignore stray touch-up
    onClose();
  }, [onClose]);

  if (!layer) return null;

  return (
    <Modal visible={!!layer} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress} />
      <View style={[styles.textEditBox, { paddingBottom: insets.bottom + 16 }]}>
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.sheetTitle}>تحرير النص</Text>
          <TouchableOpacity onPress={() => onSave(val)} style={[styles.renameBtn, { backgroundColor: colors.primary, paddingHorizontal: 16 }]} testID="text-edit-save">
            <Text style={styles.renameBtnText}>حفظ</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[
            styles.textEditInput,
            {
              fontWeight: layer.bold ? "700" : "400",
              fontStyle: layer.italic ? "italic" : "normal",
              textAlign: layer.align,
              color: layer.color,
              // Adapt the input background so light/white text stays visible.
              // We compute the relative luminance of the text color and pick
              // a dark surface for light text, otherwise a soft light surface.
              backgroundColor: isLightHex(layer.color) ? "#2A2A2E" : "#F4F4F6",
              borderColor: isLightHex(layer.color) ? "#3A3A40" : colors.borderSubtle,
            },
          ]}
          value={val}
          placeholder="اكتب هنا"
          placeholderTextColor={isLightHex(layer.color) ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)"}
          onChangeText={(t) => {
            setVal(t);
            onPatch({ text: t });
          }}
          multiline
          autoFocus
          testID="text-edit-input"
        />

        {/* Inline tools row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
          <InlineToolBtn
            label="B"
            active={layer.bold}
            onPress={() => onPatch({ bold: !layer.bold })}
            testID="text-tool-bold"
            bold
          />
          <InlineToolBtn
            label="I"
            active={layer.italic}
            onPress={() => onPatch({ italic: !layer.italic })}
            testID="text-tool-italic"
            italic
          />
          {/* Three explicit alignment buttons */}
          <AlignBtn align="right" current={layer.align} onPress={() => onPatch({ align: "right" })} testID="text-align-right" />
          <AlignBtn align="center" current={layer.align} onPress={() => onPatch({ align: "center" })} testID="text-align-center" />
          <AlignBtn align="left" current={layer.align} onPress={() => onPatch({ align: "left" })} testID="text-align-left" />
          <InlineColorBtn color={layer.color} onPress={() => setShowColor(true)} testID="text-tool-color" />
          <InlineToolBtn
            label={layer.direction === "rtl" ? "RTL" : layer.direction === "ltr" ? "LTR" : "تلقائي"}
            onPress={() => {
              const seq: TextLayer["direction"][] = ["auto", "rtl", "ltr"];
              onPatch({ direction: seq[(seq.indexOf(layer.direction) + 1) % seq.length] });
            }}
            testID="text-tool-direction"
          />
        </ScrollView>

        <ColorPickerSheet
          visible={showColor}
          onClose={() => setShowColor(false)}
          value={layer.color}
          onChange={(c) => onPatch({ color: c })}
        />
      </View>
    </Modal>
  );
}

function AlignBtn({
  align,
  current,
  onPress,
  testID,
}: {
  align: TextLayer["align"];
  current: TextLayer["align"];
  onPress: () => void;
  testID?: string;
}) {
  const icon: keyof typeof Ionicons.glyphMap =
    align === "right" ? "menu" : align === "left" ? "menu-outline" : "reorder-four";
  const active = current === align;
  return (
    <TouchableOpacity
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: active ? colors.primary : colors.surface,
        borderRadius: 10,
        minWidth: 48,
        alignItems: "center",
      }}
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name={icon} size={20} color={active ? "#fff" : colors.textPrimary} />
    </TouchableOpacity>
  );
}

function InlineToolBtn({
  label,
  onPress,
  active,
  testID,
  bold,
  italic,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  testID?: string;
  bold?: boolean;
  italic?: boolean;
}) {
  return (
    <TouchableOpacity
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: active ? colors.primary : colors.surface,
        borderRadius: 10,
        minWidth: 44,
        alignItems: "center",
      }}
      onPress={onPress}
      testID={testID}
    >
      <Text
        style={{
          fontFamily: fonts.tajawalBold,
          fontSize: 16,
          color: active ? "#fff" : colors.textPrimary,
          fontWeight: bold ? "800" : "600",
          fontStyle: italic ? "italic" : "normal",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function InlineColorBtn({ color, onPress, testID }: { color: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      style={{
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderRadius: 10,
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 8,
      }}
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name="color-palette" size={18} color={colors.textPrimary} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, borderWidth: 1, borderColor: colors.borderSubtle }} />
    </TouchableOpacity>
  );
}

/* -------------------- Color sheet (legacy — replaced by ColorPickerSheet, kept hex helpers) -------------------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || hex === "transparent") return { r: 0, g: 0, b: 0 };
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => v.toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
void hexToRgb;
void rgbToHex;

/* -------------------- Slider sheet (single value) -------------------- */

function SliderSheet({
  visible,
  onClose,
  title,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{title}</Text>
        </View>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={styles.sliderValue}>{step && step < 1 ? value.toFixed(2) : Math.round(value)}</Text>
        </View>
        <SliderBar
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          onCommit={onCommit}
        />
      </View>
    </Modal>
  );
}

/* Pure RN slider (touch-driven) - no native module dependency */
function SliderBar({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  accent,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  accent?: string;
}) {
  const [width, setWidth] = useState(0);
  const ratio = width > 0 ? (value - min) / (max - min) : 0;
  const pan = Gesture.Pan()
    .minDistance(0)
    .onUpdate((e) => {
      if (width <= 0) return;
      const x = Math.max(0, Math.min(width, e.x));
      let v = min + (x / width) * (max - min);
      if (step) v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      runOnJS(onChange)(v);
    })
    .onEnd(() => {
      if (onCommit) runOnJS(onCommit)(value);
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        testID="slider-bar"
      >
        <View
          style={[
            styles.sliderFill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: accent || colors.primary,
            },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            { left: Math.max(0, ratio * width - 12), backgroundColor: accent || colors.primary },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

/* -------------------- Generic picker sheet -------------------- */

function PickerSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "70%" }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{title}</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/* -------------------- Frame & Crop sheets -------------------- */

function FrameSheet({
  visible,
  onClose,
  layer,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  layer: ImageLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
}) {
  return (
    <PickerSheet visible={visible} onClose={onClose} title="حجم الإطار">
      <Text style={[styles.sliderLabel, { textAlign: "right" }]}>العرض: {Math.round(layer.maskWidth)}</Text>
      <SliderBar
        value={layer.maskWidth}
        min={50}
        max={3000}
        onChange={(v) => onChange({ maskWidth: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ maskWidth: Math.round(v) } as Partial<AnyLayer>, true)}
      />
      <View style={{ height: 20 }} />
      <Text style={[styles.sliderLabel, { textAlign: "right" }]}>الارتفاع: {Math.round(layer.maskHeight)}</Text>
      <SliderBar
        value={layer.maskHeight}
        min={50}
        max={3000}
        onChange={(v) => onChange({ maskHeight: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ maskHeight: Math.round(v) } as Partial<AnyLayer>, true)}
      />
    </PickerSheet>
  );
}

function CropSheet({
  visible,
  onClose,
  layer,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  layer: ImageLayer;
  onChange: (patch: Partial<AnyLayer>, record?: boolean) => void;
}) {
  return (
    <PickerSheet visible={visible} onClose={onClose} title="ضبط القص">
      <Text style={[styles.sliderLabel, { textAlign: "right" }]}>تكبير الصورة</Text>
      <SliderBar
        value={layer.imageScale}
        min={0.1}
        max={4}
        step={0.01}
        onChange={(v) => onChange({ imageScale: v } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ imageScale: v } as Partial<AnyLayer>, true)}
      />
      <View style={{ height: 16 }} />
      <Text style={[styles.sliderLabel, { textAlign: "right" }]}>إزاحة أفقية: {Math.round(layer.offsetX)}</Text>
      <SliderBar
        value={layer.offsetX}
        min={-layer.width}
        max={layer.width}
        onChange={(v) => onChange({ offsetX: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ offsetX: Math.round(v) } as Partial<AnyLayer>, true)}
      />
      <View style={{ height: 16 }} />
      <Text style={[styles.sliderLabel, { textAlign: "right" }]}>إزاحة عمودية: {Math.round(layer.offsetY)}</Text>
      <SliderBar
        value={layer.offsetY}
        min={-layer.height}
        max={layer.height}
        onChange={(v) => onChange({ offsetY: Math.round(v) } as Partial<AnyLayer>, false)}
        onCommit={(v) => onChange({ offsetY: Math.round(v) } as Partial<AnyLayer>, true)}
      />
    </PickerSheet>
  );
}

/* -------------------- Picked Color Action Sheet (Eyedropper V2) -------------------- */

function PickedColorSheet({
  color,
  canApplyToSelected,
  onDismiss,
  onApplyToSelected,
  onSaveToBrand,
}: {
  color: string | null;
  canApplyToSelected: boolean;
  onDismiss: () => void;
  onApplyToSelected: (hex: string) => void;
  onSaveToBrand: (hex: string) => Promise<void> | void;
}) {
  if (!color) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.modalBackdrop} onPress={onDismiss} />
      <View style={pickedSheetStyles.box}>
        <View style={pickedSheetStyles.header}>
          <View style={[pickedSheetStyles.swatch, { backgroundColor: color }]} />
          <View style={{ flex: 1 }}>
            <Text style={pickedSheetStyles.title}>اللون المُلتقَط</Text>
            <Text style={pickedSheetStyles.hex} selectable>
              {color}
            </Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={pickedSheetStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={pickedSheetStyles.actions}>
          {canApplyToSelected ? (
            <TouchableOpacity
              style={[pickedSheetStyles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => onApplyToSelected(color)}
              testID="picked-apply-selected"
            >
              <Ionicons name="brush" size={18} color="#fff" />
              <Text style={pickedSheetStyles.actionBtnText}>تطبيق على الطبقة المحددة</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[pickedSheetStyles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => onSaveToBrand(color)}
            testID="picked-save-brand"
          >
            <Ionicons name="bookmark" size={18} color="#fff" />
            <Text style={pickedSheetStyles.actionBtnText}>حفظ في ألوان العلامة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pickedSheetStyles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle }]}
            onPress={onDismiss}
            testID="picked-cancel"
          >
            <Ionicons name="close-circle-outline" size={18} color={colors.textPrimary} />
            <Text style={[pickedSheetStyles.actionBtnText, { color: colors.textPrimary }]}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pickedSheetStyles = StyleSheet.create({
  box: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.08)",
  },
  title: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "right",
    fontWeight: "500",
  },
  hex: {
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: "right",
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  actions: {
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

/* -------------------- Variable Picker Modal (Dynamic Fields) -------------------- */

/** Lets the user pick which booking variable a new dynamic-field
 *  layer represents. Predefined options come from
 *  `PREDEFINED_VARIABLES`; a "حقل مخصص" tab allows defining any
 *  arbitrary name + label. The chosen variable's defaultValue seeds
 *  the placeholder so the canvas isn't blank. */
function VariablePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (v: PredefinedVariable | { custom: true; name: string; label: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"predefined" | "custom">("predefined");
  const [customName, setCustomName] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  useEffect(() => {
    if (!visible) {
      setMode("predefined");
      setCustomName("");
      setCustomLabel("");
    }
  }, [visible]);

  const submitCustom = () => {
    const n = customName.trim();
    const l = customLabel.trim() || customName.trim();
    if (!n) {
      Alert.alert("اسم المتغير مطلوب", "مثال: branch_name أو order_status");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) {
      Alert.alert(
        "اسم غير صالح",
        "استخدم حروف إنجليزية وأرقام و _ فقط، ولا يبدأ برقم",
      );
      return;
    }
    onPick({ custom: true, name: n, label: l });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>اختر المتغير</Text>

        {/* Tabs */}
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => setMode("predefined")}
            style={[
              {
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor: mode === "predefined" ? colors.primary : colors.surface,
              },
            ]}
            testID="tab-predefined"
          >
            <Text
              style={{
                fontWeight: "700",
                color: mode === "predefined" ? "#fff" : colors.textPrimary,
              }}
            >
              متغيرات جاهزة
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("custom")}
            style={[
              {
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                backgroundColor: mode === "custom" ? colors.primary : colors.surface,
              },
            ]}
            testID="tab-custom"
          >
            <Text
              style={{
                fontWeight: "700",
                color: mode === "custom" ? "#fff" : colors.textPrimary,
              }}
            >
              حقل مخصص
            </Text>
          </TouchableOpacity>
        </View>

        {mode === "predefined" ? (
          <ScrollView style={{ marginTop: 14, maxHeight: 360 }}>
            {PREDEFINED_VARIABLES.map((v) => (
              <TouchableOpacity
                key={v.name}
                onPress={() => onPick(v)}
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  padding: 14,
                  marginBottom: 8,
                  backgroundColor: "#fff",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                  gap: 12,
                }}
                testID={`pick-variable-${v.name}`}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: colors.primaryLight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={
                      v.fieldType === "image"
                        ? "image-outline"
                        : v.fieldType === "date"
                          ? "calendar-outline"
                          : "text-outline"
                    }
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: colors.textPrimary }}>
                    {v.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                    {`{${v.name}}`}
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={{ marginTop: 14, gap: 12 }}>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.textPrimary,
                  textAlign: "right",
                  marginBottom: 6,
                }}
              >
                التسمية العربية (تظهر في الواجهة)
              </Text>
              <TextInput
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholder="مثال: اسم الفرع"
                placeholderTextColor={colors.textSecondary}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  textAlign: "right",
                  fontSize: 15,
                }}
                testID="custom-variable-label"
              />
            </View>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.textPrimary,
                  textAlign: "right",
                  marginBottom: 6,
                }}
              >
                اسم المتغير (مفتاح البيانات في API)
              </Text>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="branch_name"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  textAlign: "left",
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  fontSize: 14,
                }}
                testID="custom-variable-name"
              />
              <Text
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  marginTop: 4,
                  textAlign: "right",
                }}
              >
                حروف إنجليزية، أرقام، أو _ فقط
              </Text>
            </View>
            <TouchableOpacity
              onPress={submitCustom}
              style={{
                marginTop: 4,
                backgroundColor: colors.primary,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
              testID="submit-custom-variable"
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>إضافة الحقل</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

/* -------------------- Image Field Size Modal -------------------- */

/** Prompts the user for the placeholder dimensions of a new
 *  image-type dynamic field. Width × height are entered manually
 *  (with quick aspect-ratio presets); the operator can still resize
 *  the box later by selecting the layer and dragging its handles. */
function ImageFieldSizeModal({
  visible,
  canvasWidth,
  canvasHeight,
  variableLabel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  canvasWidth: number;
  canvasHeight: number;
  variableLabel: string;
  onClose: () => void;
  onConfirm: (w: number, h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  // Default to a square ~40% of the smaller canvas side.
  const baseSide = Math.round(Math.min(canvasWidth, canvasHeight) * 0.4);
  const [w, setW] = useState(String(baseSide));
  const [h, setH] = useState(String(baseSide));

  useEffect(() => {
    if (visible) {
      const s = Math.round(Math.min(canvasWidth, canvasHeight) * 0.4);
      setW(String(s));
      setH(String(s));
    }
  }, [visible, canvasWidth, canvasHeight]);

  const submit = () => {
    const wn = parseInt(w, 10);
    const hn = parseInt(h, 10);
    if (!wn || !hn || wn < 20 || hn < 20 || wn > canvasWidth || hn > canvasHeight) {
      Alert.alert(
        "أبعاد غير صالحة",
        `أدخل قياسًا بين 20 و ${Math.min(canvasWidth, canvasHeight)} بكسل`,
      );
      return;
    }
    onConfirm(wn, hn);
  };

  const PRESETS: { label: string; w: number; h: number }[] = [
    { label: "مربع صغير", w: Math.round(canvasWidth * 0.25), h: Math.round(canvasWidth * 0.25) },
    { label: "مربع وسط",  w: Math.round(canvasWidth * 0.4),  h: Math.round(canvasWidth * 0.4) },
    { label: "بورتريه",    w: Math.round(canvasWidth * 0.35), h: Math.round(canvasWidth * 0.5) },
    { label: "بانوراما",   w: Math.round(canvasWidth * 0.6),  h: Math.round(canvasWidth * 0.35) },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.sheetTitle}>أبعاد الصورة</Text>
          <TouchableOpacity onPress={onClose} testID="close-image-size">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text
          style={{
            marginTop: 6,
            color: colors.textSecondary,
            fontSize: 12,
            textAlign: "right",
          }}
        >
          الحقل: {variableLabel} — يمكنك تعديل الأبعاد لاحقًا بسحب الزوايا
        </Text>

        {/* Presets */}
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.label}
              onPress={() => {
                setW(String(p.w));
                setH(String(p.h));
              }}
              style={{
                flex: 1,
                minWidth: 100,
                paddingVertical: 10,
                paddingHorizontal: 8,
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.borderSubtle,
                alignItems: "center",
              }}
              testID={`size-preset-${p.label}`}
            >
              <Text style={{ fontWeight: "700", color: colors.textPrimary, fontSize: 12 }}>
                {p.label}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                {p.w}×{p.h}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Manual */}
        <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                textAlign: "right",
                marginBottom: 4,
              }}
            >
              العرض
            </Text>
            <TextInput
              value={w}
              onChangeText={setW}
              keyboardType="number-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.borderSubtle,
                paddingVertical: 12,
                paddingHorizontal: 8,
                textAlign: "center",
                fontSize: 16,
                fontWeight: "700",
              }}
              testID="image-field-width"
            />
          </View>
          <Text style={{ alignSelf: "flex-end", paddingBottom: 12, color: colors.textSecondary }}>×</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                textAlign: "right",
                marginBottom: 4,
              }}
            >
              الارتفاع
            </Text>
            <TextInput
              value={h}
              onChangeText={setH}
              keyboardType="number-pad"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.borderSubtle,
                paddingVertical: 12,
                paddingHorizontal: 8,
                textAlign: "center",
                fontSize: 16,
                fontWeight: "700",
              }}
              testID="image-field-height"
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={submit}
          style={{
            marginTop: 16,
            backgroundColor: colors.primary,
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: "center",
          }}
          testID="confirm-image-field-size"
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            إدراج الحقل ({w}×{h})
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* -------------------- styles -------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    height: 56,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nameWrap: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 6,
  },
  projectName: {
    fontFamily: fonts.tajawalBold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "right",
    maxWidth: 160,
  },
  topActions: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  exportBtn: {
    flexDirection: "row-reverse",
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    gap: 6,
    marginRight: 4,
  },
  exportBtnText: { color: "#fff", fontFamily: fonts.tajawalBold, fontSize: 13 },
  workspace: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
  },
  canvasFrame: {
    backgroundColor: "#fff",
    overflow: "hidden",
    borderRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  safeWarn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "rgba(220,53,69,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  safeWarnText: {
    color: colors.danger,
    fontFamily: fonts.tajawalBold,
    fontSize: 12,
  },
  eyedropperHint: {
    position: "absolute",
    top: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10, 92, 54, 0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  eyedropperHintText: {
    color: "#fff",
    fontFamily: fonts.tajawalBold,
    fontSize: 12,
  },
  eyedropperCancel: {
    position: "absolute",
    bottom: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  eyedropperCancelText: {
    color: colors.textPrimary,
    fontFamily: fonts.tajawalBold,
    fontSize: 13,
  },
  eyedropIndicator: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  eyedropInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyedropLoading: {
    position: "absolute",
    bottom: -4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  eyedropLoadingText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: fonts.tajawalBold,
  },
  toolbar: {
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    minHeight: 96,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  toolbarHint: {
    fontFamily: fonts.ibmPlexRegular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "right",
    paddingHorizontal: spacing.md,
  },
  toolbarSmallBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    gap: 6,
    marginLeft: spacing.sm,
  },
  toolbarSmallBtnText: {
    fontFamily: fonts.tajawalBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  toolbarRow: {
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.sm,
  },
  toolBtn: {
    minWidth: 64,
    height: 72,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  toolIconWrap: { alignItems: "center", justifyContent: "center" },
  toolTintDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  toolLabel: {
    fontFamily: fonts.tajawalBold,
    fontSize: 11,
    maxWidth: 70,
  },
  toolDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: 4,
  },
  addFab: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1A1D1C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  maskEditBar: {
    backgroundColor: "#1A1D1C",
    paddingTop: 12,
    paddingHorizontal: spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  maskEditHint: {
    flex: 1,
    color: "#fff",
    fontFamily: fonts.tajawalBold,
    fontSize: 12,
    textAlign: "right",
  },
  maskDoneBtn: {
    flexDirection: "row-reverse",
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    gap: 4,
  },
  maskDoneText: {
    color: "#fff",
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "85%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.tajawalExtraBold,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: "right",
  },
  sheetSection: {
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: "right",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  addCard: {
    flex: 1,
    height: 90,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addCardLabel: {
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
    color: colors.primary,
  },
  shapeGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  shapeCard: {
    width: "31%",
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 6,
  },
  shapeLabel: {
    fontFamily: fonts.tajawalBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  layerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 8,
    marginBottom: 4,
    backgroundColor: colors.surface,
  },
  layerName: {
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: "right",
  },
  layerTypeBadge: {
    fontFamily: fonts.ibmPlexRegular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "right",
  },
  layerNameInput: {
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: "right",
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    borderRadius: 6,
  },
  layerThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPanel: {
    fontFamily: fonts.ibmPlexRegular,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerRowText: {
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: "right",
  },
  sliderTrack: {
    height: 32,
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: "center",
    overflow: "visible",
    paddingHorizontal: 0,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 16,
    opacity: 0.35,
  },
  sliderThumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    top: 4,
    backgroundColor: colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sliderLabel: {
    fontFamily: fonts.tajawalBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sliderValue: {
    fontFamily: fonts.ibmPlexBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  paletteGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  colorPreview: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  colorHex: {
    fontFamily: fonts.ibmPlexBold,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "left",
  },
  applyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  applyBtnText: { color: "#fff", fontFamily: fonts.tajawalBold },
  textEditBox: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  textEditInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.tajawalBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlignVertical: "top",
  },
  renameBox: {
    position: "absolute",
    top: "30%",
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: spacing.lg,
  },
  renameTitle: {
    fontFamily: fonts.tajawalBold,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: "right",
    marginBottom: spacing.sm,
  },
  renameInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontFamily: fonts.tajawalBold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "right",
  },
  renameBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  renameBtnText: {
    color: "#fff",
    fontFamily: fonts.tajawalBold,
    fontSize: 14,
  },
});

// Suppress unused imports lint
void Image;