import { hudIcon } from "./hud-icons.js";
const keys = ["food", "water", "wood", "stone", "planks", "ore", "coal", "metal", "tools", "weapons", "clay", "bricks", "steel", "parts"];
const label = (key) => key[0].toUpperCase() + key.slice(1);
const $ = (selector) => document.querySelector(selector);

// Sampled stock levels show net change, not gross production or consumption.
const graph = (samples, key, width, height) => {
  if (samples.length < 2) return "";
  const low = height === 140 ? 0 : Math.min(...samples.map((sample) => sample[key]));
  const high = Math.max(low + 1, ...samples.map((sample) => sample[key]));
  const first = samples[0].tick;
  const duration = samples.at(-1).tick - first;
  return samples.map((sample) => `${4 + (sample.tick - first) / duration * (width - 8)},${height - 4 - (sample[key] - low) / Math.max(1, high - low) * (height - 8)}`).join(" ");
};

/** Owns resource counters and bounded, server-recorded stock history. */
export function createResourceHistory() {
  let history = [];
  let selected = "food";
  let range = 480;
  let capacities = null;
  $("#stockpile").innerHTML = keys.map((key) => `<button type="button" class="resource" data-resource="${key}" aria-label="${label(key)} history" aria-controls="resource-history" aria-expanded="false">${hudIcon(key)}<strong data-count="${key}">—</strong><small data-trend="${key}" aria-hidden="true">—</small></button>`).join("");
  const close = () => {
    $("#resource-history").hidden = true;
    for (const button of document.querySelectorAll("[data-resource]")) button.setAttribute("aria-expanded", "false");
  };
  const render = () => {
    if (history.length === 0) return;
    const last = history.at(-1);
    const recent = history.filter((sample) => sample.tick >= last.tick - 480);
    for (const key of keys) {
      const delta = last[key] - recent[0][key];
      $(`[data-trend="${key}"]`).textContent = recent.length < 2 ? "—" : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
      $(`[data-resource="${key}"]`).dataset.direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      $(`[data-resource="${key}"]`).dataset.history = `${label(key)} history · ${delta > 0 ? "+" : ""}${delta} over ${( (last.tick - recent[0].tick) / 480).toFixed(1)} colony days`;
    }
    const samples = history.filter((sample) => range === 0 || sample.tick >= last.tick - range);
    $("#history-title").textContent = `${label(selected)} history`;
    if (samples.length < 2) {
      $("#history-chart").innerHTML = '<p class="empty">Collecting history… new samples every 10 simulation ticks.</p>';
      $("#history-summary").textContent = `${last[selected]} in storage`;
      return;
    }
    const first = samples[0];
    const delta = last[selected] - first[selected];
    const low = 0;
    const high = Math.max(1, ...samples.map((sample) => sample[selected]));
    $("#history-summary").textContent = `${last[selected]} / ${capacities[selected]} stored · ${delta > 0 ? "+" : ""}${delta} over ${((last.tick - first.tick) / 480).toFixed(1)} days`;
    $("#history-chart").innerHTML = `<div class="chart-scale"><span>${high}</span><span>${low}</span></div><svg viewBox="0 0 360 140" role="img" aria-label="${label(selected)} stock ranged from ${low} to ${high}; net change ${delta}."><polyline points="${graph(samples, selected, 360, 140)}" /></svg><div class="chart-times"><span>Day ${(first.tick / 480 + 1).toFixed(1)}</span><span>Day ${(last.tick / 480 + 1).toFixed(1)}</span></div>`;
  };
  $("#stockpile").addEventListener("click", (event) => {
    const button = event.target.closest("[data-resource]");
    if (!button) return;
    selected = button.dataset.resource;
    close();
    $("#resource-history").hidden = false;
    button.setAttribute("aria-expanded", "true");
    $("#settlement-summary").hidden = true;
    $("#toggle-settlement").setAttribute("aria-expanded", "false");
    $("#inspector").hidden = true;
    $("#journal").hidden = true;
    $("#toggle-journal").setAttribute("aria-expanded", "false");
    render();
  });
  $("#close-history").addEventListener("click", () => { close(); $(`[data-resource="${selected}"]`).focus(); });
  for (const button of document.querySelectorAll("[data-history-range]")) button.addEventListener("click", () => {
    range = Number(button.dataset.historyRange);
    for (const option of document.querySelectorAll("[data-history-range]")) option.setAttribute("aria-pressed", String(option === button));
    render();
  });
  return {
    close,
    update(world) {
      capacities = world.limits;
      for (const key of keys) {
        $(`[data-count="${key}"]`).textContent = Math.floor(world.stockpile[key]);
        const button = $(`[data-resource="${key}"]`);
        if(["clay","bricks","steel","parts"].includes(key))button.hidden=world.stockpile[key]===0&&!Object.hasOwn(world.strategy.budget,key);
        const description = `${label(key)}: ${Math.floor(world.stockpile[key])} / ${capacities[key]}. ${button.dataset.history ?? "Collecting history"}. Click for chart.`;
        button.dataset.tooltip = label(key);
        button.dataset.tooltipDetail = description;
        button.setAttribute("aria-label", description);
      }
    },
    replace(samples) { history = samples; render(); },

  };
}
