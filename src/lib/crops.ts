/**
 * Planting timings relative to frost dates.
 *
 * Offsets are in weeks. Spring offsets are relative to the last spring frost
 * (negative = before it). `fallPlantWeeks` is weeks *before* the first fall
 * frost. Figures follow common extension-service guidance and are a starting
 * point, not a guarantee — local conditions vary.
 */

/** How much cold a crop tolerates. Decides which frost-risk date it is planned against. */
export type FrostTolerance = "tender" | "half-hardy" | "hardy";

export type Crop = {
  id: string;
  name: string;
  /** What people grow it for; given to the model so "salsa" can map to tomato + pepper. */
  uses: string;
  frost: FrostTolerance;
  startIndoorsWeeks?: number;
  transplantWeeks?: number;
  directSowWeeks?: number;
  fallPlantWeeks?: number;
  daysToMaturity: number;
};

export const CROPS: Crop[] = [
  { id: "tomato", name: "Tomato", uses: "salsa, sauce, salads, sandwiches", frost: "tender", startIndoorsWeeks: -7, transplantWeeks: 2, daysToMaturity: 75 },
  { id: "pepper", name: "Pepper", uses: "salsa, stir-fry, hot sauce, stuffed peppers", frost: "tender", startIndoorsWeeks: -9, transplantWeeks: 2, daysToMaturity: 80 },
  { id: "eggplant", name: "Eggplant", uses: "curry, baba ganoush, grilling", frost: "tender", startIndoorsWeeks: -9, transplantWeeks: 3, daysToMaturity: 80 },
  { id: "basil", name: "Basil", uses: "pesto, pizza, caprese, Thai dishes", frost: "tender", startIndoorsWeeks: -6, transplantWeeks: 2, daysToMaturity: 60 },
  { id: "cucumber", name: "Cucumber", uses: "pickles, salads, raita", frost: "tender", directSowWeeks: 2, daysToMaturity: 60 },
  { id: "zucchini", name: "Zucchini", uses: "zucchini bread, grilling, summer squash dishes", frost: "tender", directSowWeeks: 1, daysToMaturity: 55 },
  { id: "pumpkin", name: "Pumpkin & winter squash", uses: "pie, soup, jack-o'-lanterns, roasting", frost: "tender", directSowWeeks: 2, daysToMaturity: 100 },
  { id: "bean", name: "Bush bean", uses: "green beans, stir-fry, kids' snacking", frost: "tender", directSowWeeks: 1, daysToMaturity: 55 },
  { id: "corn", name: "Sweet corn", uses: "corn on the cob, summer barbecues, salsa", frost: "tender", directSowWeeks: 2, daysToMaturity: 80 },
  { id: "sunflower", name: "Sunflower", uses: "flowers for pollinators, seeds, kids' projects", frost: "tender", directSowWeeks: 1, daysToMaturity: 80 },
  { id: "marigold", name: "Marigold", uses: "companion flowers, pest deterrent, color", frost: "tender", startIndoorsWeeks: -6, transplantWeeks: 1, daysToMaturity: 50 },
  { id: "pea", name: "Pea", uses: "snap peas, snow peas, kids' snacking, spring salads", frost: "hardy", directSowWeeks: -4, daysToMaturity: 60 },
  { id: "spinach", name: "Spinach", uses: "salads, smoothies, palak, sautéed greens", frost: "hardy", directSowWeeks: -5, fallPlantWeeks: 6, daysToMaturity: 40 },
  { id: "lettuce", name: "Lettuce", uses: "salads, sandwiches, wraps", frost: "half-hardy", directSowWeeks: -3, fallPlantWeeks: 6, daysToMaturity: 45 },
  { id: "kale", name: "Kale", uses: "salads, chips, smoothies, soups", frost: "hardy", startIndoorsWeeks: -8, transplantWeeks: -3, fallPlantWeeks: 8, daysToMaturity: 55 },
  { id: "broccoli", name: "Broccoli", uses: "stir-fry, roasting, steamed sides", frost: "half-hardy", startIndoorsWeeks: -8, transplantWeeks: -2, daysToMaturity: 70 },
  { id: "cabbage", name: "Cabbage", uses: "slaw, sauerkraut, kimchi, soups", frost: "hardy", startIndoorsWeeks: -8, transplantWeeks: -3, daysToMaturity: 70 },
  { id: "carrot", name: "Carrot", uses: "snacking, soups, roasting, kids' gardens", frost: "half-hardy", directSowWeeks: -3, daysToMaturity: 70 },
  { id: "beet", name: "Beet", uses: "roasting, salads, pickling, greens", frost: "half-hardy", directSowWeeks: -3, daysToMaturity: 60 },
  { id: "radish", name: "Radish", uses: "quick harvest, salads, kids' first crop", frost: "hardy", directSowWeeks: -4, fallPlantWeeks: 5, daysToMaturity: 28 },
  { id: "onion", name: "Onion", uses: "salsa, cooking base, scallions", frost: "hardy", transplantWeeks: -4, daysToMaturity: 100 },
  { id: "cilantro", name: "Cilantro", uses: "salsa, chutney, tacos, curry garnish", frost: "half-hardy", directSowWeeks: -2, fallPlantWeeks: 6, daysToMaturity: 45 },
  { id: "potato", name: "Potato", uses: "fries, mash, roasting", frost: "half-hardy", directSowWeeks: -2, daysToMaturity: 90 },
  { id: "garlic", name: "Garlic", uses: "cooking, pesto, roasting; planted in fall for next summer", frost: "hardy", fallPlantWeeks: 4, daysToMaturity: 240 },
];

const BY_ID = new Map(CROPS.map((c) => [c.id, c]));

export const CROP_IDS = CROPS.map((c) => c.id) as [string, ...string[]];

export function getCrop(id: string): Crop | undefined {
  return BY_ID.get(id);
}
