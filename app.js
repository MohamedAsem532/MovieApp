const API_KEY = "3dcf537e67d20a2901c0e0ee8f77270a";
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

// Genre chip label -> TMDB genre id
const GENRE_IDS = { Action: 28, Comedy: 35, Drama: 18, Horror: 27, "Sci-Fi": 878 };

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const menuToggle = $("menu-toggle");
const siteNav = $("site-nav");
const searchForm = $("search-form");
const searchInput = $("search-input");
const navSeries = $("nav-series");
const navFavorites = $("nav-favorites");
const hero = $("hero");
const genreFilters = $("genre-filters");
const movieGrid = $("movie-grid");
const emptyState = $("empty-state");
const cardTemplate = $("movie-card-template");
const dialog = $("movie-dialog");
const dialogClose = $("dialog-close");
const dialogFavorite = $("dialog-favorite");

// ---------- State ----------
const state = {
  mode: "movie", // "movie" | "tv"
  genre: "All",
  query: "",
  view: "browse", // "browse" | "favorites"
  items: [],
  current: null,
};
const genreNames = {};
let favorites = [];
try {
  favorites = JSON.parse(localStorage.getItem("reel-favorites")) || [];
} catch {
  favorites = [];
}

// ---------- API ----------
async function api(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

// Normalise movie and TV results into one shape
function normalize(item, type) {
  const date = item.release_date || item.first_air_date || "";
  return {
    id: item.id,
    type,
    title: item.title || item.name || "Untitled",
    year: date ? date.slice(0, 4) : "N/A",
    rating: item.vote_average || 0,
    overview: item.overview || "No overview available.",
    poster: item.poster_path ? `${IMG}/w500${item.poster_path}` : "",
    backdrop: item.backdrop_path ? `${IMG}/w1280${item.backdrop_path}` : "",
    genres: (item.genre_ids || []).map((id) => genreNames[id]).filter(Boolean),
  };
}

async function loadGenres() {
  try {
    const [m, t] = await Promise.all([api("/genre/movie/list"), api("/genre/tv/list")]);
    [...m.genres, ...t.genres].forEach((g) => (genreNames[g.id] = g.name));
  } catch (err) {
    console.error("Could not load genres", err);
  }
}

async function fetchItems() {
  const type = state.mode;
  let data;
  if (state.query) {
    data = await api(`/search/${type}`, { query: state.query });
  } else if (state.genre !== "All") {
    data = await api(`/discover/${type}`, {
      with_genres: GENRE_IDS[state.genre],
      sort_by: "popularity.desc",
    });
  } else {
    data = await api(`/${type}/popular`);
  }
  return data.results.map((r) => normalize(r, type));
}

// ---------- Rendering ----------
function ratingClass(r) {
  return r >= 7 ? "green" : r >= 5 ? "orange" : "red";
}

function renderCards(items) {
  movieGrid.innerHTML = "";
  emptyState.hidden = items.length > 0;

  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".card");
    const poster = node.querySelector(".poster");
    const badge = poster.querySelector("span");

    if (item.poster) poster.style.setProperty("--poster", `url(${item.poster})`);
    badge.textContent = `★ ${item.rating.toFixed(1)}`;
    badge.className = ratingClass(item.rating);

    node.querySelector(".title").textContent = item.title;
    node.querySelector(".year").textContent = item.year;
    node.querySelector(".genre").textContent = item.genres[0] || "N/A";

    card.addEventListener("click", () => openDialog(item));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDialog(item);
      }
    });
    frag.appendChild(node);
  });
  movieGrid.appendChild(frag);
}

function renderHero(item) {
  if (!item) return;
  state.hero = item;
  hero.style.setProperty("--poster", `url(${item.backdrop || item.poster})`);
  hero.querySelector(".hero-genre").textContent = item.genres[0] || "Popular";
  hero.querySelector(".hero-year").textContent = item.year;
  const rating = hero.querySelector(".hero-meta .green, .hero-meta .orange, .hero-meta .red");
  rating.textContent = `★ ${item.rating.toFixed(1)}`;
  rating.className = ratingClass(item.rating);
  hero.querySelector(".hero-title").textContent = item.title;
  hero.querySelector(".hero-text").textContent = item.overview;
}

async function refresh() {
  movieGrid.setAttribute("aria-busy", "true");
  try {
    if (state.view === "favorites") {
      state.items = favorites;
    } else {
      state.items = await fetchItems();
    }
    renderCards(state.items);
  } catch (err) {
    console.error(err);
    movieGrid.innerHTML = "";
    emptyState.textContent = "Could not load movies. Check your connection and try again.";
    emptyState.hidden = false;
  } finally {
    movieGrid.removeAttribute("aria-busy");
  }
}

// ---------- Dialog ----------
function openDialog(item) {
  state.current = item;
  $("dialog-title").textContent = item.title;
  dialog.querySelector(".dialog-year").textContent = item.year;
  dialog.querySelector(".dialog-genre").textContent = item.genres.join(", ") || "N/A";
  dialog.querySelector(".dialog-rating").textContent = item.rating.toFixed(1);
  dialog.querySelector(".dialog-overview").textContent = item.overview;
  dialog
    .querySelector(".dialog-poster")
    .style.setProperty("--poster", `url(${item.poster || item.backdrop})`);
  updateFavoriteButton();
  dialog.showModal();
}

function isFavorite(item) {
  return favorites.some((f) => f.id === item.id && f.type === item.type);
}

function updateFavoriteButton() {
  dialogFavorite.textContent = isFavorite(state.current) ? "Remove from my list" : "Add to my list";
}

function toggleFavorite() {
  const item = state.current;
  if (!item) return;
  favorites = isFavorite(item)
    ? favorites.filter((f) => !(f.id === item.id && f.type === item.type))
    : [...favorites, item];
  try {
    localStorage.setItem("reel-favorites", JSON.stringify(favorites));
  } catch {}
  updateFavoriteButton();
  if (state.view === "favorites") {
    state.items = favorites;
    renderCards(state.items);
  }
}

async function watchTrailer(item) {
  if (!item) return;
  try {
    const data = await api(`/${item.type}/${item.id}/videos`);
    const trailer =
      data.results.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
      data.results.find((v) => v.site === "YouTube");
    if (trailer) {
      window.open(`https://www.youtube.com/watch?v=${trailer.key}`, "_blank", "noopener");
    } else {
      alert("No trailer available for this title.");
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------- Events ----------
menuToggle.addEventListener("click", () => {
  const open = siteNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

function setActiveNav(el) {
  siteNav.querySelectorAll("a").forEach((a) => a.classList.remove("active"));
  el.classList.add("active");
  siteNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

siteNav.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  setActiveNav(link);
  if (link === navFavorites) {
    state.view = "favorites";
  } else {
    state.view = "browse";
    state.mode = link === navSeries ? "tv" : "movie";
    state.query = "";
    searchInput.value = "";
    searchInput.placeholder = state.mode === "tv" ? "Search series" : "Search movies";
  }
  emptyState.textContent = "No movies found. Try a different title or genre.";
  refresh();
});

genreFilters.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  genreFilters.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
  chip.classList.add("is-active");
  state.genre = chip.textContent.trim();
  state.query = "";
  searchInput.value = "";
  state.view = "browse";
  refresh();
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.query = searchInput.value.trim();
  state.view = "browse";
  refresh();
});

$("hero-details").addEventListener("click", () => state.hero && openDialog(state.hero));
$("hero-watch").addEventListener("click", () => watchTrailer(state.hero));
dialogClose.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // click on backdrop
});
dialogFavorite.addEventListener("click", toggleFavorite);

// ---------- Init ----------
(async function init() {
  await loadGenres();
  state.items = await fetchItems().catch((err) => {
    console.error(err);
    return [];
  });
  if (state.items.length) {
    renderHero(state.items.find((i) => i.backdrop) || state.items[0]);
  }
  renderCards(state.items);
  if (!state.items.length) {
    emptyState.textContent = "Could not load movies. Check your connection and try again.";
    emptyState.hidden = false;
  }
})();
