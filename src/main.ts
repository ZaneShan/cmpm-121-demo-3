// imported dependencies from example.ts
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// gameplay parameters
const MAP_ZOOM_LEVEL = 19;
const _CACHE_SPAWN_GRID_SIZE = 8;
const CACHE_SPAWN_CHANCE = 0.05;
const POSITION_ADJUST = 0.0001;
const PLAYER_RADIUS = 50;
const OAKES_CLASSROOM_POSITION = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);
let globalSerialCounter = 0;
const collectedCoins: Coin[] = [];

interface Cell {
  i: number;
  j: number;
}

interface Coin {
  cell: Cell;
  serial: number;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
}

// flyweight storage
const caches: Map<string, Cache> = new Map();
const cacheMarkers: Map<string, leaflet.Marker> = new Map();

// getter/constructors

function getOrCreateCoin(cell: Cell): Coin {
  const coin: Coin = { cell, serial: globalSerialCounter++ };
  return coin;
}

// helper to return long / lat values for a cell
function getCachePosition(i: number, j: number): leaflet.LatLng {
  const latitudeAdjustment = i * POSITION_ADJUST;
  const longitudeAdjustment = j * POSITION_ADJUST;
  return leaflet.latLng(
    OAKES_CLASSROOM_POSITION.lat + latitudeAdjustment,
    OAKES_CLASSROOM_POSITION.lng + longitudeAdjustment,
  );
}

function getOrCreateCache(i: number, j: number): Cache {
  const key = `${i},${j}`;
  if (!caches.has(key)) {
    caches.set(key, { cell: { i, j }, coins: [] });
  }
  return caches.get(key)!;
}

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

// movement
const Keys = {
  north: document.getElementById("north")!,
  west: document.getElementById("west")!,
  south: document.getElementById("south")!,
  east: document.getElementById("east")!,
  reset: document.getElementById("reset")!,
};

// move functionality
function movePlayer(direction: string) {
  const currentPosition = playerMarker.getLatLng();
  let newPosition: leaflet.LatLng;

  switch (direction) {
    case "north":
      newPosition = new leaflet.LatLng(
        currentPosition.lat + POSITION_ADJUST,
        currentPosition.lng,
      );
      break;
    case "south":
      newPosition = new leaflet.LatLng(
        currentPosition.lat - POSITION_ADJUST,
        currentPosition.lng,
      );
      break;
    case "west":
      newPosition = new leaflet.LatLng(
        currentPosition.lat,
        currentPosition.lng - POSITION_ADJUST,
      );
      break;
    case "east":
      newPosition = new leaflet.LatLng(
        currentPosition.lat,
        currentPosition.lng + POSITION_ADJUST,
      );
      break;
    default:
      return;
  }

  // update the player marker's position and camera
  playerMarker.setLatLng(newPosition);
  map.panTo(newPosition);
  updateCacheVisibility(newPosition);
}

// event listeners to arrow buttons
Keys.north.addEventListener("click", () => movePlayer("north"));
Keys.south.addEventListener("click", () => movePlayer("south"));
Keys.west.addEventListener("click", () => movePlayer("west"));
Keys.east.addEventListener("click", () => movePlayer("east"));
Keys.reset.addEventListener("click", () => {
  populateMap();
  updateCacheVisibility(playerMarker.getLatLng());
});

// display the player's points
let playerPoints = 0;
const inventoryPanel = document.querySelector<HTMLDivElement>(
  "#inventoryPanel",
)!;
inventoryPanel.innerHTML = "No coins";

//clear markers from map
function clearMapMarkers() {
  cacheMarkers.forEach((marker) => {
    marker.remove();
  });
  cacheMarkers.clear();
  console.log("All markers have been cleared from the map.");
}

// update the visibility of caches around the player
function updateCacheVisibility(playerPosition: leaflet.LatLng) {
  clearMapMarkers();

  // update visibility for caches within range
  caches.forEach((cache, cacheKey) => {
    const cachePosition = getCachePosition(cache.cell.i, cache.cell.j);
    const distance = playerPosition.distanceTo(cachePosition);

    if (distance <= PLAYER_RADIUS) {
      // create and add the marker if it doesn't exist if in range
      if (!cacheMarkers.has(cacheKey)) {
        const marker = leaflet.marker(cachePosition).addTo(map);
        marker.bindPopup(() => {
          const popupDiv = document.createElement("div");
          updatePopupContent(popupDiv, cache.cell);
          return popupDiv;
        });

        // store the created marker in cacheMarkers map
        cacheMarkers.set(cacheKey, marker);
      }
    }
  });
}

function updatePopupContent(popupDiv: HTMLDivElement, cell: Cell) {
  const cache = caches.get(`${cell.i},${cell.j}`);
  if (cache) {
    const coinsHTML = cache.coins
      .map((coin) =>
        `<button id="collect-${coin.serial}">Collect Coin #${coin.serial}</button>`
      )
      .join("<br>");

    popupDiv.innerHTML = `    
      <div>Cache ${getCachePosition(cell.i, cell.j).lat.toFixed(6)}:${
      getCachePosition(cell.i, cell.j).lng.toFixed(6)
    }</div>
      <div>${coinsHTML}</div>
      <button id="deposit" ${
      playerPoints === 0 ? "disabled" : ""
    }>Deposit Coin</button> 
    `;

    // event listeners for each coin's collect button
    cache.coins.forEach((coin) => {
      popupDiv.querySelector<HTMLButtonElement>(`#collect-${coin.serial}`)!
        .addEventListener("click", () => {
          collect(cell, coin.serial);
          updatePopupContent(popupDiv, cell); // update popup content after collecting a coin
        });
    });

    // event listener for deposit button
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        deposit(cell);
        updatePopupContent(popupDiv, cell); // update popup after depositing a coin
      },
    );
  }
}

// collect coin function
function collect(cell: Cell, serial: number) {
  const key = `${cell.i},${cell.j}`;
  const cache = caches.get(key);
  if (cache) {
    const coinIndex = cache.coins.findIndex((coin) => coin.serial === serial);
    if (coinIndex !== -1) {
      const [coin] = cache.coins.splice(coinIndex, 1); // remove coin from cache
      collectedCoins.push(coin); // add to player's collected coins
      playerPoints++; // increment player points
      updateInventoryPanel(); // update inventory panel
    }
  }
}

// deposit coin function
function deposit(cell: Cell) {
  const key = `${cell.i},${cell.j}`;
  const cache = caches.get(key);

  if (cache && playerPoints > 0) {
    const coinToDeposit = collectedCoins.pop(); // get the last coin
    if (coinToDeposit) {
      coinToDeposit.cell = cell; // update the coin's position
      cache.coins.push(coinToDeposit); // add the coin to the cache's coins array
      playerPoints--; // decrement player points
      updateInventoryPanel(); // update the inventory panel
    }
  } else {
    console.log("No coins to deposit or cache not found.");
  }
}

// inventory html changer / plurality conditonal checker helper function
function updateInventoryPanel() {
  // display individual coin serial numbers with lat/lng
  const inventoryList = collectedCoins
    .map((coin) => {
      return `<div>Coin #${coin.serial} at 
      ${(coin.cell.i + OAKES_CLASSROOM_POSITION.lat).toFixed(6)}: 
      ${(coin.cell.j + OAKES_CLASSROOM_POSITION.lng).toFixed(6)}</div>`;
    })
    .join("");

  if (collectedCoins.length === 0) {
    inventoryPanel.innerHTML = "No coins collected.";
  } else {
    inventoryPanel.innerHTML = `
      <div>${collectedCoins.length} coin(s) collected:</div>
      ${inventoryList}
    `;
  }
}

// reset helper
function clearCachesAndMarkers() {
  cacheMarkers.forEach((marker) => {
    marker.remove();
  });

  cacheMarkers.clear();
  caches.clear();
}

// spawn caches
function populateMap() {
  clearCachesAndMarkers();
  const CACHE_SPAWN_GRID_SIZE = 8;

  for (let i = -CACHE_SPAWN_GRID_SIZE; i <= CACHE_SPAWN_GRID_SIZE; i++) {
    for (let j = -CACHE_SPAWN_GRID_SIZE; j <= CACHE_SPAWN_GRID_SIZE; j++) {
      const luckValue = luck([i, j].toString());
      if (luckValue < CACHE_SPAWN_CHANCE) {
        const cache = getOrCreateCache(i, j);
        const cachePosition = getCachePosition(i, j);

        // create coins for the cache
        const initialCoins = Math.ceil(Math.random() * 5);
        for (let c = 0; c < initialCoins; c++) {
          const coin = getOrCreateCoin({ i, j });
          cache.coins.push(coin);
        }

        // store the cache in the caches map and cachemarkers map
        caches.set(`${i},${j}`, cache);
        const marker = leaflet.marker(cachePosition).addTo(map);
        cacheMarkers.set(`${i},${j}`, marker);

        console.log(
          `Cache created at [${i}, ${j}] with ${cache.coins.length} coins.`,
        );
      }
    }
  }
}

populateMap();
updateCacheVisibility(playerMarker.getLatLng());
