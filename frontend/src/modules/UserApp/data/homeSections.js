// Promotional slots take priority. A product can appear only once on the home
// page, even when it qualifies for several independently sourced collections.
export const HOME_SECTION_PRIORITY = [
  "flashSale",
  "dailyDeals",
  "newArrivals",
  "mostPopular",
  "trending",
  "recommended",
];

export const DEFAULT_HOME_SECTIONS = [
  { key: "newArrivals", title: "New Arrivals", subtitle: "Fresh products just added" },
  { key: "mostPopular", title: "Most Popular", subtitle: "" },
  { key: "dailyDeals", title: "Daily Deals", subtitle: "Limited time offers" },
  { key: "flashSale", title: "Flash Sale", subtitle: "Limited time offers" },
  { key: "trending", title: "Trending Now", subtitle: "" },
  { key: "recommended", title: "Recommended for You", subtitle: "More products to explore" },
].map((section) => ({ ...section, enabled: true, limit: 6, mode: "automatic", pinnedIds: [] }));

export const selectHomeSections = (candidates = {}, configuration = DEFAULT_HOME_SECTIONS, pinnedProducts = {}) => {
  // Keep the previous numeric signature for callers that specify a common cap.
  const sections = typeof configuration === "number"
    ? DEFAULT_HOME_SECTIONS.map((section) => ({ ...section, limit: configuration }))
    : configuration;
  const used = new Set();
  const selected = Object.fromEntries(HOME_SECTION_PRIORITY.map((key) => [key, []]));
  const settings = new Map(sections.map((section) => [section.key, section]));

  // Explicit placements are reserved before automatic rows consume their pools.
  for (const section of sections) {
    if (!section.enabled || section.mode === "automatic" || !selected[section.key]) continue;
    const available = new Map([
      ...(candidates[section.key] || []),
      ...(pinnedProducts[section.key] || []),
    ].map((product) => [String(product?.id || product?._id || ""), product]));
    for (const id of section.pinnedIds || []) {
      const normalized = String(id);
      const product = available.get(normalized);
      if (!product || used.has(normalized)) continue;
      selected[section.key].push(product);
      used.add(normalized);
      if (selected[section.key].length >= section.limit) break;
    }
  }

  for (const section of HOME_SECTION_PRIORITY) {
    const config = settings.get(section);
    if (!config?.enabled || config.mode === "manual") continue;
    if (selected[section].length >= config.limit) continue;
    for (const product of candidates[section] || []) {
      const id = String(product?.id || product?._id || "").trim();
      if (!id || used.has(id)) continue;
      selected[section].push(product);
      used.add(id);
      if (selected[section].length >= config.limit) break;
    }
  }

  return selected;
};
