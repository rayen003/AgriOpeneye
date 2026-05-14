export const CROP_COLORS = {
  vineyard:     '#6B21A8',
  sunflower:    '#D97706',
  sorghum:      '#92400E',
  winter_wheat: '#A16207',
  uncertain:    '#6B7280',
}

export const CROP_LABELS = {
  vineyard:     'Vineyard',
  sunflower:    'Sunflower',
  sorghum:      'Sorghum',
  winter_wheat: 'Winter Wheat',
  uncertain:    'Uncertain',
}

export const TARGET_CROPS = ['vineyard', 'winter_wheat', 'sunflower', 'sorghum']

export const ALL_FILTER_CROPS = [...TARGET_CROPS, 'uncertain']

// Literature reference ranges per crop — used in FeatureTable status icons
export const CROP_REFS = {
  vineyard: {
    ndvi_peak_value: [0.35, 0.55],
    ndwi_at_peak:    [-0.15, 0.05],
    ndre_at_peak:    [0.15, 0.35],
  },
  winter_wheat: {
    ndvi_peak_value: [0.60, 0.80],
    ndwi_at_peak:    [0.05, 0.25],
    ndre_at_peak:    [0.20, 0.40],
  },
  sunflower: {
    ndvi_peak_value: [0.50, 0.70],
    ndwi_at_peak:    [-0.25, 0.00],
    ndre_at_peak:    [0.15, 0.30],
  },
  sorghum: {
    ndvi_peak_value: [0.55, 0.75],
    ndwi_at_peak:    [-0.20, 0.05],
    ndre_at_peak:    [0.15, 0.35],
  },
}

export const REGION_CONFIG = {
  catalonia: { center: [40.95, 0.50], zoom: 10 },
  bavaria:   { center: [48.50, 11.5], zoom: 8  },
}
