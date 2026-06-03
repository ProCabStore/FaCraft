// price-utils.js – shared pricing logic for all pages
// expects global `optionsData` to be loaded before using these functions

function getPercentageFromValue(val) {
  if (val == null) return 100;
  if (typeof val === 'object') {
    if (val.price && typeof val.price.percentage === 'number') return val.price.percentage;
    if (typeof val.percentage === 'number') return val.percentage;
  }
  if (typeof val === 'number') return val;
  return 100;
}

function getMaterialBasePrice(materialKey) {
  if (!materialKey || !window.optionsData) return 0;
  const opt = window.optionsData.material?.[materialKey];
  if (opt && typeof opt.price === 'number') return opt.price;
  return 0;
}

function getColorBasePrices(colorGroupName) {
  if (!colorGroupName || !window.optionsData) return {};
  return window.optionsData.colors?.[colorGroupName] || {};
}

function computeColorEntryCost(colorKey, colorVal, baseColorPrices) {
  let cost = 0;
  if (Array.isArray(colorVal)) {
    for (const part of colorVal) {
      const pct = getPercentageFromValue(part) / 100;
      const partColorName = (part && part.color) ? part.color : (colorKey.includes('+') ? colorKey.split('+')[0].trim() : colorKey);
      const partBase = baseColorPrices[partColorName] != null ? baseColorPrices[partColorName] : 0;
      cost += partBase * pct;
    }
    return cost;
  }
  if (typeof colorVal === 'object') {
    const pct = getPercentageFromValue(colorVal) / 100;
    const base = baseColorPrices[colorKey] != null ? baseColorPrices[colorKey] : 0;
    return base * pct;
  }
  if (typeof colorVal === 'number') {
    const pct = colorVal / 100;
    const base = baseColorPrices[colorKey] != null ? baseColorPrices[colorKey] : 0;
    return base * pct;
  }
  return 0;
}

// NEW: compute price based on actual selected type, color, and accessories
function calculatePriceWithSelections(product, selectedTypeKey, selectedColorName, selectedAccessories, options) {
  if (!options || !selectedTypeKey) return 0;
  const typeData = product[selectedTypeKey];
  if (!typeData) return 0;

  // Material cost
  let materialCost = 0;
  for (const [matKey, matVal] of Object.entries(typeData)) {
    if (matKey.toLowerCase().includes('color')) continue;
    const basePrice = getMaterialBasePrice(matKey);
    const pct = getPercentageFromValue(matVal) / 100;
    materialCost += basePrice * pct;
  }

  // Color cost (only selected color)
  let colorCost = 0;
  const colorGroups = Object.entries(typeData).filter(([k]) => k.toLowerCase().includes('color'));
  for (const [groupName, colorsObj] of colorGroups) {
    const baseColorPrices = getColorBasePrices(groupName);
    // find the entry matching selectedColorName
    for (const [colKey, colVal] of Object.entries(colorsObj)) {
      if (colKey.toLowerCase() === selectedColorName.toLowerCase()) {
        colorCost += computeColorEntryCost(colKey, colVal, baseColorPrices);
        break;
      }
    }
  }

  // Accessories cost (selected options)
  let accessoriesCost = 0;
  const typeKeys = Object.keys(product).filter(k => k.toLowerCase().startsWith('type'));
  const excludedKeys = ['id', 'name', 'images', 'category', 'description', ...typeKeys];
  const accessoryKeys = Object.keys(product).filter(k => !excludedKeys.includes(k));
  for (const accKey of accessoryKeys) {
    const accItem = product[accKey];
    if (!accItem || !accItem.quantity) continue;
    const selectedOpt = selectedAccessories[accKey];
    if (!selectedOpt) continue;
    const accOptions = options.accessory?.[accKey] || {};
    const pricePerUnit = accOptions[selectedOpt];
    if (typeof pricePerUnit === 'number') {
      accessoriesCost += pricePerUnit * accItem.quantity;
    }
  }

  const total = materialCost + colorCost + accessoriesCost;
  return total;
}

// Original function remains for listing pages (cheapest configuration)
function calculateOriginalPrice(product, options) {
  if (!options) return 0;
  let bestPrice = Infinity;
  const typeKeys = Object.keys(product).filter(k => k.toLowerCase().startsWith('type'));
  for (const typeKey of typeKeys) {
    const typeData = product[typeKey];
    if (!typeData) continue;
    let materialCost = 0;
    for (const [matKey, matVal] of Object.entries(typeData)) {
      if (matKey.toLowerCase().includes('color')) continue;
      const basePrice = getMaterialBasePrice(matKey);
      const pct = getPercentageFromValue(matVal) / 100;
      materialCost += basePrice * pct;
    }
    let colorCost = 0;
    const colorGroups = Object.entries(typeData).filter(([k]) => k.toLowerCase().includes('color'));
    for (const [groupName, colorsObj] of colorGroups) {
      const baseColorPrices = getColorBasePrices(groupName);
      let cheapestInGroup = Infinity;
      for (const [colKey, colVal] of Object.entries(colorsObj)) {
        const cost = computeColorEntryCost(colKey, colVal, baseColorPrices);
        if (cost < cheapestInGroup) cheapestInGroup = cost;
      }
      if (cheapestInGroup === Infinity) cheapestInGroup = 0;
      colorCost += cheapestInGroup;
    }
    let accessoriesCost = 0;
    const excludedKeys = ['id', 'name', 'images', 'category', 'description', ...typeKeys];
    const accessoryKeys = Object.keys(product).filter(k => !excludedKeys.includes(k));
    for (const accKey of accessoryKeys) {
      const accItem = product[accKey];
      if (!accItem || !accItem.quantity) continue;
      const accOptions = options.accessory?.[accKey] || {};
      let cheapestOption = Infinity;
      for (const optName of Object.keys(accOptions)) {
        const price = accOptions[optName];
        if (typeof price === 'number' && price < cheapestOption) cheapestOption = price;
      }
      if (cheapestOption !== Infinity) accessoriesCost += cheapestOption * accItem.quantity;
    }
    const total = materialCost + colorCost + accessoriesCost;
    if (total < bestPrice) bestPrice = total;
  }
  return bestPrice === Infinity ? 0 : bestPrice;
}

function applyDiscount(product, originalPrice) {
  if (!product.promotion) return originalPrice;
  const type = product.discountType;
  const value = product.discountValue;
  if (type === 'percentage') return originalPrice * (1 - value / 100);
  if (type === 'fixed') return Math.max(0, originalPrice - value);
  return originalPrice;
}

function getProductMainImage(product) {
  if (product.images) {
    if (product.images.extra && product.images.extra.length) return product.images.extra[0];
    const firstKey = Object.keys(product.images).find(k => k !== 'extra');
    if (firstKey) return product.images[firstKey];
  }
  return 'https://placehold.co/600x600?text=FA+CRAFT';
}

function extractColorNames(product) {
  const colorsSet = new Set();
  const typeKeys = Object.keys(product).filter(k => k.toLowerCase().startsWith('type'));
  for (const tKey of typeKeys) {
    const typeData = product[tKey];
    if (!typeData) continue;
    for (const [key, val] of Object.entries(typeData)) {
      if (key.toLowerCase().includes('color')) {
        if (typeof val === 'object' && !Array.isArray(val)) {
          Object.keys(val).forEach(c => colorsSet.add(c));
        } else if (Array.isArray(val)) {
          val.forEach(v => {
            if (v && v.color) colorsSet.add(v.color);
            else if (typeof v === 'string') colorsSet.add(v);
          });
        }
      }
    }
  }
  return Array.from(colorsSet);
}