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
    { label: '1:1', ratio: 1, width: 1080, height: 1080 },
    { label: '4:5', ratio: 0.8, width: 1080, height: 1350 },
    { label: '5:4', ratio: 1.25, width: 1350, height: 1080 },
    { label: '9:16', ratio: 0.5625, width: 1080, height: 1920 },
    { label: '16:9', ratio: 1.7778, width: 1920, height: 1080 },
    { label: '3:4', ratio: 0.75, width: 1080, height: 1440 },
    { label: '4:3', ratio: 1.3333, width: 1440, height: 1080 },
    { label: 'A4', ratio: 0.7071, width: 2480, height: 3508 },
    { label: 'Screen', ratio: 0.5625, width: 1080, height: 1920 },
];

export function getPresetSize(category: string): typeof PRESET_SIZES[0] | undefined {
    return PRESET_SIZES.find(preset => preset.category === category);
}

export function getAspectRatio(ratio: number): typeof ASPECT_RATIOS[0] | undefined {
    return ASPECT_RATIOS.find(ar => Math.abs(ar.ratio - ratio) < 0.01);
}