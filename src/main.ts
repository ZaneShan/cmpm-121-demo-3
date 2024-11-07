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
const cellMap: Map<string, Cell> = new Map();
const caches: Map<string, Coin[]> = new Map();

// getter/constructors
function getOrCreateCell(i: number, j: number): Cell {
  const key = `${i},${j}`;
  if (!cellMap.has(key)) {
    cellMap.set(key, { i, j });
  }
  return cellMap.get(key)!;
}

function getOrCreateCoin(cell: Cell) {
  // give unique serial number
  const coin: Coin = { cell, serial: globalSerialCounter++ };
  return coin;
}

function getOrCreateCache(cell: Cell, initialCoins: number): Coin[] {
  const key = `${cell.i},${cell.j}`;
  if (!caches.has(key)) {
    const coins = Array.from(
      { length: initialCoins },
      () => getOrCreateCoin(cell),
    );
    caches.set(key, coins);
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

// display the player's points
let playerPoints = 0;
const inventoryPanel = document.querySelector<HTMLDivElement>(
  "#inventoryPanel",
)!;
inventoryPanel.innerHTML = "No coins";

// helper to return long / lat values for a cell
function getCachePosition(i: number, j: number) {
  //start with null island position
  const latitudeAdjustment = i * CACHE_POSITION_ADJUST;
  const longitudeAdjustment = j * CACHE_POSITION_ADJUST;

  // adjust to origin position
  return leaflet.latLng(
    OAKES_CLASSROOM_POSITION.lat + latitudeAdjustment,
    OAKES_CLASSROOM_POSITION.lng + longitudeAdjustment,
  );
}

// create marker with respective popups to collect or deposit coins
function createMapMarker(cell: Cell) {
  const position = getCachePosition(cell.i, cell.j);

  const marker = leaflet.marker(position);
  marker.addTo(map);

  // initialize popup content
  marker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    updatePopupContent(popupDiv, cell);
    return popupDiv;
  });
}

function updatePopupContent(popupDiv: HTMLDivElement, cell: Cell) {
  const cache = caches.get(`${cell.i},${cell.j}`);
  if (cache) {
    const coinsHTML = cache
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
    cache.forEach((coin) => {
      popupDiv.querySelector<HTMLButtonElement>(`#collect-${coin.serial}`)!
        .addEventListener("click", () => {
          collect(cell, coin.serial);
          updatePopupContent(popupDiv, cell); // Update popup content after collecting a coin
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
    const coinIndex = cache.findIndex((coin) => coin.serial === serial);
    if (coinIndex !== -1) {
      const [coin] = cache.splice(coinIndex, 1); // remove coin from cache
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
      coinToDeposit.cell = cell;
      cache.push(coinToDeposit);
      playerPoints--;
      updateInventoryPanel();
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

// spawn caches
function populateMap() {
  for (let i = CACHE_SPAWN_GRID_SIZE; i > -CACHE_SPAWN_GRID_SIZE; i--) {
    for (let j = CACHE_SPAWN_GRID_SIZE; j > -CACHE_SPAWN_GRID_SIZE; j--) {
      // luck value given by luck()
      const luckValue = luck([i, j].toString());
      if (luckValue < CACHE_SPAWN_CHANCE) {
        //createCache(i, j);
        console.log(`i: ${i}, j: ${j}, luck: ${luckValue}`);
        const cell = getOrCreateCell(i, j);
        const initialCoins = Math.ceil(
          luck([i, j, "initialValue"].toString()) * 5,
        );
        getOrCreateCache(cell, initialCoins);
        createMapMarker(cell);
      }
    }
  }
}

populateMap();
