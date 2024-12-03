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
let origin = leaflet.latLng(0, 0); // point at which the markers are anchored
let globalSerialCounter = 0;
const collectedCoins: Coin[] = [];
let geoLocation = false;

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
    origin.lat + latitudeAdjustment,
    origin.lng + longitudeAdjustment,
  );
}

function getCachePositionRelativeToPlayer(
  i: number,
  j: number,
): leaflet.LatLng {
  const playerPosition = playerMarker.getLatLng();
  const latitudeAdjustment = i * POSITION_ADJUST;
  const longitudeAdjustment = j * POSITION_ADJUST;
  return leaflet.latLng(
    playerPosition.lat + latitudeAdjustment,
    playerPosition.lng + longitudeAdjustment,
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
  center: leaflet.latLng(0, 0),
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

// keys
const Keys = {
  north: document.getElementById("north")! as HTMLButtonElement,
  west: document.getElementById("west")! as HTMLButtonElement,
  south: document.getElementById("south")! as HTMLButtonElement,
  east: document.getElementById("east")! as HTMLButtonElement,
  reset: document.getElementById("reset")! as HTMLButtonElement,
  geo: document.getElementById("geo")! as HTMLButtonElement,
};

function toggleArrowKeyControls(enabled: boolean) {
  Keys.north.disabled = !enabled;
  Keys.south.disabled = !enabled;
  Keys.west.disabled = !enabled;
  Keys.east.disabled = !enabled;
}

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
  saveGameState();
}

// event listeners to arrow buttons
Keys.north.addEventListener("click", () => movePlayer("north"));
Keys.south.addEventListener("click", () => movePlayer("south"));
Keys.west.addEventListener("click", () => movePlayer("west"));
Keys.east.addEventListener("click", () => movePlayer("east"));

let geoWatchId: number | null = null;

Keys.geo.addEventListener("click", () => {
  activateGeoTracking();
  populateMap();
});

Keys.reset.addEventListener("click", () => {
  // prompt players to ask if they indeed wish to reset
  const confirmLoad = prompt(
    "Are you sure you want to reset your game state? This will also wipe saved progress. Type 'yes' to confirm.",
  );

  if (confirmLoad?.toLowerCase() === "yes") {
    populateMap();
    updateCacheVisibility(playerMarker.getLatLng());
    collectedCoins.length = 0;
    updateInventoryPanel;
    updateInventoryPanel();
    saveGameState();
    // remove move history
    if (movementHistory) {
      movementHistory.remove();
      movementHistory = null;
    }
  }
});

// polyline render history
let movementHistory: leaflet.Polyline | null = null;
let lastPosition: leaflet.LatLng | null = null;

function activateGeoTracking() {
  geoLocation = !geoLocation; // Toggle geolocation mode

  if (geoLocation) {
    // initialize a new polyline
    if (movementHistory) {
      movementHistory.remove();
    }
    movementHistory = leaflet.polyline([], { color: "blue" }).addTo(map);

    // toggle arrow keys
    toggleArrowKeyControls(false);

    // start geolocation tracking
    geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geolocationPosition = leaflet.latLng(latitude, longitude);

        // update the player marker's position
        playerMarker.setLatLng(geolocationPosition);
        map.panTo(geolocationPosition);

        // update origin (point at which the markers are anchored)
        origin = geolocationPosition;

        // only add a new point if the player has moved significantly
        if (
          lastPosition === null ||
          geolocationPosition.distanceTo(lastPosition) > 3
        ) {
          movementHistory.addLatLng(geolocationPosition);
          lastPosition = geolocationPosition; // Update last recorded position
        }

        updateCacheVisibility(geolocationPosition);
      },
      (error) => {
        console.error("Error getting geolocation: ", error);
        alert("Please enable location services.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      },
    );
  } else {
    // stop geolocation tracking when disabled
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }

    // enable arrow key movement
    toggleArrowKeyControls(true);

    // remove polyline and movement history
    if (movementHistory) {
      movementHistory.remove();
      movementHistory = null;
    }

    lastPosition = null; // reset the last known position when tracking stops
  }
}

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

function updatePopupContent(popupDiv: HTMLDivElement, cell: Cell): void {
  popupDiv.innerHTML = generatePopupHTML(cell); // Only updates the HTML now
  bindPopupEvents(popupDiv, cell); // Delegates event setup
}

function generatePopupHTML(cell: Cell): string {
  const cache = caches.get(`${cell.i},${cell.j}`);
  if (!cache) {
    return "<div>No Cache Found</div>";
  }

  const coinsHTML = cache.coins
    .map((coin) =>
      `<button id="collect-${coin.serial}">Collect Coin #${coin.serial}</button>`
    )
    .join("<br>");

  const depositButton = `<button id="deposit" ${
    collectedCoins.length === 0 ? "disabled" : ""
  }>Deposit Coin</button>`;

  return `
    <div>Cache ${getCachePosition(cell.i, cell.j).lat.toFixed(6)}:${
    getCachePosition(cell.i, cell.j).lng.toFixed(6)
  }</div>
    <div>${coinsHTML}</div>
    ${depositButton}
  `;
}

function bindPopupEvents(popupDiv: HTMLDivElement, cell: Cell): void {
  const cache = caches.get(`${cell.i},${cell.j}`);
  if (!cache) return;

  cache.coins.forEach((coin) => {
    popupDiv
      .querySelector<HTMLButtonElement>(`#collect-${coin.serial}`)!
      .addEventListener("click", () => {
        collect(cell, coin.serial);
        updatePopupContent(popupDiv, cell); // update popup content after collecting a coin
      });
  });

  popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
    "click",
    () => {
      deposit(cell);
      updatePopupContent(popupDiv, cell); // update popup after depositing a coin
    },
  );
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
      updateInventoryPanel(); // update inventory panel
    }
  }
  saveGameState();
}

// deposit coin function
function deposit(cell: Cell) {
  const key = `${cell.i},${cell.j}`;
  const cache = caches.get(key);

  if (cache && collectedCoins.length > 0) {
    const coinToDeposit = collectedCoins.pop(); // get the last coin
    if (coinToDeposit) {
      coinToDeposit.cell = cell; // update the coin's position
      cache.coins.push(coinToDeposit); // add the coin to the cache's coins array
      updateInventoryPanel(); // update the inventory panel
    }
  } else {
    console.log("No coins to deposit or cache not found.");
  }
  saveGameState();
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
  origin = playerMarker.getLatLng();
  const CACHE_SPAWN_GRID_SIZE = 8;

  for (let i = -CACHE_SPAWN_GRID_SIZE; i <= CACHE_SPAWN_GRID_SIZE; i++) {
    for (let j = -CACHE_SPAWN_GRID_SIZE; j <= CACHE_SPAWN_GRID_SIZE; j++) {
      const luckValue = luck([origin.lat + i, origin.lng + j].toString());
      if (luckValue < CACHE_SPAWN_CHANCE) {
        const cache = getOrCreateCache(i, j);
        const cachePosition = getCachePositionRelativeToPlayer(i, j);

        // create coins for the cache
        const initialCoins = Math.ceil(Math.random() * 5);
        for (let c = 0; c < initialCoins; c++) {
          const coin = getOrCreateCoin({ i, j });
          cache.coins.push(coin);
        }

        // store the cache in the caches map and cachemarkers map
        const marker = leaflet.marker(cachePosition).addTo(map);
        cacheMarkers.set(`${i},${j}`, marker);
        caches.set(`${i},${j}`, cache);

        console.log(
          `Cache created at [${i}, ${j}] with ${cache.coins.length} coins.`,
        );
      }
    }
  }
  updateCacheVisibility(origin);
}

interface GameState {
  playerPosition: { lat: number; lng: number };
  collectedCoins: Coin[];
  cacheState: { key: string; cache: Cache }[];
}

interface CacheEntry {
  key: string;
  cache: Cache;
}

// save and load
function saveGameState() {
  const playerPosition = playerMarker.getLatLng();

  // serialize cacheState as an array of objects with key and cache data so it can be read later by loadgamestate
  const gameState: GameState = {
    playerPosition: { lat: playerPosition.lat, lng: playerPosition.lng },
    collectedCoins: [...collectedCoins], // Deep clone to prevent reference issues
    cacheState: Array.from(caches.entries()).map(([key, cache]) => ({
      key,
      cache: {
        cell: cache.cell,
        coins: [...cache.coins], // deep clone coins array
      },
    })),
  };

  // save to localStorage
  localStorage.setItem("gameState", JSON.stringify(gameState));

  console.log("Game state saved!");
}

// load game state from localStorage
function loadGameState() {
  const savedState = localStorage.getItem("gameState");

  if (savedState) {
    const gameState: GameState = JSON.parse(savedState);

    // restore player position
    const restoredPosition = leaflet.latLng(
      gameState.playerPosition.lat,
      gameState.playerPosition.lng,
    );
    playerMarker.setLatLng(restoredPosition);
    map.panTo(restoredPosition);

    origin = restoredPosition;

    // restore inventory
    collectedCoins.length = 0; // Clear current coins
    gameState.collectedCoins.forEach((coin: Coin) => {
      collectedCoins.push(coin); // Restore coins
    });
    updateInventoryPanel();

    // restore caches
    caches.clear();
    gameState.cacheState.forEach((cacheEntry: CacheEntry) => {
      const { key, cache } = cacheEntry;
      caches.set(key, {
        cell: cache.cell,
        coins: [...cache.coins], // deep clone coins
      });
    });

    console.log("Game state loaded!");
  } else {
    console.log("No saved game state found.");
  }
}

// Initializers

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
map.panTo(playerMarker.getLatLng());

// display the player's points
const inventoryPanel = document.querySelector<HTMLDivElement>(
  "#inventoryPanel",
)!;
inventoryPanel.innerHTML = "No coins";

// populate map with new markers
populateMap();

// load prev gamestate (if it exists)
loadGameState();
updateCacheVisibility(origin);
