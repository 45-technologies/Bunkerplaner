/* Web Worker: rechnet FE-Plattenmodelle im Hintergrund, damit die Oberfläche flüssig bleibt. */
/* global importScripts, BP */
importScripts('geo.js', 'fe.js', 'slabs.js');
self.onmessage = (e) => {
  const { id, job } = e.data || {};
  try {
    const res = BP.slabs.run(job);
    self.postMessage({ id, res }, BP.slabs.transferables(res));
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
