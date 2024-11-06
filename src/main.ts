// imported dependencies from example.ts
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// gameplay parameters
const MAP_ZOOM_LEVEL = 19;
const CACHE_SPAWN_GRID_SIZE = 8;
const CACHE_SPAWN_CHANCE = 0.05;
const CACHE_POSITION_ADJUST = 0.0001;
const OAKES_CLASSROOM_POSITION = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);

// create map (initalized in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM_POSITION,
  zoom: MAP_ZOOM_LEVEL,
  minZoom: MAP_ZOOM_LEVEL,
  maxZoom: MAP_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});
// map background
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: MAP_ZOOM_LEVEL,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// red player icon
const playerDivIcon = leaflet.divIcon({
  html: '<div class="player-marker-circle"></div>',
  iconSize: [20, 20],
});
const playerMarker = leaflet.marker(OAKES_CLASSROOM_POSITION, {
  icon: playerDivIcon,
});
playerMarker.bindTooltip("You Are Here");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
const inventoryPanel = document.querySelector<HTMLDivElement>(
  "#inventoryPanel",
)!;
inventoryPanel.innerHTML = "No coins";

// cache spawner
function createCache(i: number, j: number) {
  const origin = OAKES_CLASSROOM_POSITION;

  const position = leaflet.latLng(
    origin.lat + (i * CACHE_POSITION_ADJUST),
    origin.lng + (j * CACHE_POSITION_ADJUST),
  );
  const marker = leaflet.marker(position);
  marker.addTo(map);

  // initialize point values
  let pointValue = Math.ceil(luck([i, j, "initialValue"].toString()) * 10); // using ceil instead of floor so that values will always be more than 0

  // tooltip popup
  marker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>${i},${j}</div>
      <div>Contains <span id="value">${pointValue}</span> coins.</div>
      <div> <button id="collect">Collect</button> 
      <button id="deposit">Deposit</button> </div>
    `;

    // collect button
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (pointValue > 0) {
          pointValue--;
          playerPoints++;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString(); // update cache value
          inventoryPanelUpdate(playerPoints); // update players point count
        }
      });
    // deposit button
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        if (playerPoints > 0) {
          playerPoints--;
          pointValue++;
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            pointValue.toString();
          inventoryPanelUpdate(playerPoints);
        }
      });

    return popupDiv;
  });
}

// inventory html changer / plurality conditonal checker helper function
function inventoryPanelUpdate(input: number) {
  if (input === 1) {
    inventoryPanel.innerHTML = `${playerPoints} coin accumulated`;
  } else if (input > 1) {
    inventoryPanel.innerHTML = `${playerPoints} coins accumulated`;
  } else {
    inventoryPanel.innerHTML = `No coins`;
  }
}

// spawn caches
function populateMap() {
  for (let i = CACHE_SPAWN_GRID_SIZE; i > -CACHE_SPAWN_GRID_SIZE; i--) {
    for (let j = CACHE_SPAWN_GRID_SIZE; j > -CACHE_SPAWN_GRID_SIZE; j--) {
      // luck value given by luck()
      const luckValue = luck([i, j].toString());
      if (luckValue < CACHE_SPAWN_CHANCE) {
        console.log(`i: ${i}, j: ${j}, luck: ${luckValue}`);
        createCache(i, j);
      }
    }
  }
}

populateMap();
