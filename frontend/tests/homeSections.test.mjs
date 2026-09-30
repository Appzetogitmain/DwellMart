import test from "node:test";
import assert from "node:assert/strict";
import { selectHomeSections } from "../src/modules/UserApp/data/homeSections.js";

const item = (id) => ({ id, name: `Product ${id}` });

test("one product appears in only one homepage section", () => {
  const selected = selectHomeSections({
    flashSale: [item("a"), item("b")],
    dailyDeals: [item("a"), item("c")],
    newArrivals: [item("b"), item("c"), item("d")],
    mostPopular: [item("a"), item("d"), item("e")],
    trending: [item("e"), item("f")],
    recommended: [item("f"), item("g")],
  }, 2);

  assert.deepEqual(selected.flashSale.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(selected.dailyDeals.map((p) => p.id), ["c"]);
  assert.deepEqual(selected.newArrivals.map((p) => p.id), ["d"]);
  assert.deepEqual(selected.mostPopular.map((p) => p.id), ["e"]);
  assert.deepEqual(selected.trending.map((p) => p.id), ["f"]);
  assert.deepEqual(selected.recommended.map((p) => p.id), ["g"]);
  const allIds = Object.values(selected).flat().map((p) => p.id);
  assert.equal(new Set(allIds).size, allIds.length);
});

test("empty or repeated candidate pools leave sections empty", () => {
  const selected = selectHomeSections({ flashSale: [item("a")], dailyDeals: [item("a")] });
  assert.equal(selected.flashSale.length, 1);
  assert.deepEqual(selected.dailyDeals, []);
  assert.deepEqual(selected.recommended, []);
});

test("manual pins reserve products and disabled rows stay empty", () => {
  const sections = [
    { key: "newArrivals", enabled: false, limit: 6, mode: "automatic", pinnedIds: [] },
    { key: "mostPopular", enabled: true, limit: 2, mode: "manual", pinnedIds: ["b"] },
    { key: "dailyDeals", enabled: true, limit: 2, mode: "pinned_and_auto", pinnedIds: ["c"] },
    { key: "flashSale", enabled: true, limit: 6, mode: "automatic", pinnedIds: [] },
    { key: "trending", enabled: true, limit: 6, mode: "automatic", pinnedIds: [] },
    { key: "recommended", enabled: true, limit: 6, mode: "automatic", pinnedIds: [] },
  ];
  const selected = selectHomeSections({
    newArrivals: [item("a"), item("b")],
    mostPopular: [item("a"), item("b")],
    dailyDeals: [item("b"), item("c"), item("d")],
  }, sections, { mostPopular: [item("b")], dailyDeals: [item("c")] });

  assert.deepEqual(selected.newArrivals, []);
  assert.deepEqual(selected.mostPopular.map((p) => p.id), ["b"]);
  assert.deepEqual(selected.dailyDeals.map((p) => p.id), ["c", "d"]);
});
