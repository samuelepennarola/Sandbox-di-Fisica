// localStorage può essere assente o lanciare eccezioni (navigazione privata): tutto è opzionale.
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('fs.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('fs.' + key, JSON.stringify(value)); } catch { /* ignora */ }
  },
};
