export const PRESET_SIZES = [
    {
        name: 'مربع 1080',
        width: 1080,
        height: 1080,
        category: 'square' as const
    },
    {
        name: 'ستوري 1080×1920',
        width: 1080,
        height: 1920,
        category: 'story' as const
    },
    {
        name: 'بوست 1200×1500',
        width: 1200,
        height: 1500,
        category: 'post' as const
    },
    {
        name: 'مربع 720',
        width: 720,
        height: 720,
        category: 'square' as const
    },
    {
        name: 'ستوري 720×1280',
        width: 720,
        height: 1280,
        category: 'story' as const
    },
    {
        name: 'بوست 800×1000',
        width: 800,
        height: 1000,
        category: 'post' as const
    },
    {
        name: 'A4 ورقي',
        width: 2480,
        height: 3508,
        category: 'custom' as const
    },
    {
        name: 'A3 ورقي',
        width: 3508,
        height: 4960,
        category: 'custom' as const
    }
];

export const ASPECT_RATIOS = [
    { label: '1:1', name: 'مربع', ratio: 1, width: 1080, height: 1080 },
    { label: '4:5', name: 'بوست', ratio: 0.8, width: 1080, height: 1350 },
    { label: '5:4', name: 'عريض', ratio: 1.25, width: 1350, height: 1080 },
    { label: '9:16', name: 'ستوري', ratio: 0.5625, width: 1080, height: 1920 },
    { label: '16:9', name: 'عرضي', ratio: 1.7778, width: 1920, height: 1080 },
    { label: '3:4', name: '3:4', ratio: 0.75, width: 1080, height: 1440 },
    { label: '4:3', name: '4:3', ratio: 1.3333, width: 1440, height: 1080 },
    { label: 'A4', name: 'ورقي', ratio: 0.7071, width: 2480, height: 3508 },
    { label: 'Screen', name: 'شاشة', ratio: 0.5625, width: 1080, height: 1920 },
];

export function getPresetSize(category: string): typeof PRESET_SIZES[0] | undefined {
    return PRESET_SIZES.find(preset => preset.category === category);
}

export function getAspectRatio(ratio: number): typeof ASPECT_RATIOS[0] | undefined {
    return ASPECT_RATIOS.find(ar => Math.abs(ar.ratio - ratio) < 0.01);
}

// Collage layouts — each layout splits the box into cells
// Layouts support 2, 3, or 4 images
export const COLLAGE_LAYOUTS = [
    // 2 images
    {
        id: '2h', name: '2 أفقي', count: 2, cells: [
            { x: 0, y: 0, w: 0.5, h: 1 },
            { x: 0.5, y: 0, w: 0.5, h: 1 },
        ]
    },
    {
        id: '2v', name: '2 رأسي', count: 2, cells: [
            { x: 0, y: 0, w: 1, h: 0.5 },
            { x: 0, y: 0.5, w: 1, h: 0.5 },
        ]
    },
    // 3 images
    {
        id: '3h', name: '3 أفقي', count: 3, cells: [
            { x: 0, y: 0, w: 0.333, h: 1 },
            { x: 0.333, y: 0, w: 0.334, h: 1 },
            { x: 0.667, y: 0, w: 0.333, h: 1 },
        ]
    },
    {
        id: '3v', name: '3 رأسي', count: 3, cells: [
            { x: 0, y: 0, w: 1, h: 0.333 },
            { x: 0, y: 0.333, w: 1, h: 0.334 },
            { x: 0, y: 0.667, w: 1, h: 0.333 },
        ]
    },
    {
        id: '3-1t-2b', name: '1 فوق + 2', count: 3, cells: [
            { x: 0, y: 0, w: 1, h: 0.5 },
            { x: 0, y: 0.5, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ]
    },
    {
        id: '3-2t-1b', name: '2 فوق + 1', count: 3, cells: [
            { x: 0, y: 0, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0, w: 0.5, h: 0.5 },
            { x: 0, y: 0.5, w: 1, h: 0.5 },
        ]
    },
    {
        id: '3-1l-2r', name: '1 يسار + 2', count: 3, cells: [
            { x: 0, y: 0, w: 0.5, h: 1 },
            { x: 0.5, y: 0, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ]
    },
    {
        id: '3-2l-1r', name: '2 يسار + 1', count: 3, cells: [
            { x: 0, y: 0, w: 0.5, h: 0.5 },
            { x: 0, y: 0.5, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0, w: 0.5, h: 1 },
        ]
    },
    {
        id: '3-big-left', name: 'كبير يسار', count: 3, cells: [
            { x: 0, y: 0, w: 0.667, h: 1 },
            { x: 0.667, y: 0, w: 0.333, h: 0.5 },
            { x: 0.667, y: 0.5, w: 0.333, h: 0.5 },
        ]
    },
    {
        id: '3-big-right', name: 'كبير يمين', count: 3, cells: [
            { x: 0, y: 0, w: 0.333, h: 0.5 },
            { x: 0, y: 0.5, w: 0.333, h: 0.5 },
            { x: 0.333, y: 0, w: 0.667, h: 1 },
        ]
    },
    // 4 images
    {
        id: '4grid', name: '4 شبكي', count: 4, cells: [
            { x: 0, y: 0, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0, w: 0.5, h: 0.5 },
            { x: 0, y: 0.5, w: 0.5, h: 0.5 },
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        ]
    },
    {
        id: '4h', name: '4 أفقي', count: 4, cells: [
            { x: 0, y: 0, w: 0.25, h: 1 },
            { x: 0.25, y: 0, w: 0.25, h: 1 },
            { x: 0.5, y: 0, w: 0.25, h: 1 },
            { x: 0.75, y: 0, w: 0.25, h: 1 },
        ]
    },
    {
        id: '4v', name: '4 رأسي', count: 4, cells: [
            { x: 0, y: 0, w: 1, h: 0.25 },
            { x: 0, y: 0.25, w: 1, h: 0.25 },
            { x: 0, y: 0.5, w: 1, h: 0.25 },
            { x: 0, y: 0.75, w: 1, h: 0.25 },
        ]
    },
] as const;