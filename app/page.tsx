'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';   // ← This was the fix
import * as yaml from 'yaml';

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
] as const;

export default function Home() {
  const [entries, setEntries] = useState<{ name: string; sign: string }[]>([]);
  const [name, setName] = useState('');
  const [selectedSign, setSelectedSign] = useState(ZODIAC_SIGNS[0]);
  const [isLoading, setIsLoading] = useState(true);

  const docRef = useRef<Y.Doc | null>(null);
  const arrayRef = useRef<Y.Array<Y.Map<any>> | null>(null);
  const providerRef = useRef<IndexeddbPersistence | null>(null);   // ← Updated type

  const updateUI = () => {
    if (!arrayRef.current) return;
    const arr = arrayRef.current.toArray().map((map: Y.Map<any>) => ({
      name: map.get('name') ?? '',
      sign: map.get('sign') ?? '',
    }));
    setEntries(arr);
  };

  const uint8ToBase64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
  const base64ToUint8 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  const syncWithServer = async (doc: Y.Doc) => {
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (data.state) {
        const update = base64ToUint8(data.state);
        Y.applyUpdate(doc, update);
      }
      const vector = Y.encodeStateVector(doc);
      localStorage.setItem('zodiac-last-vector', uint8ToBase64(vector));
    } catch (e) {
      console.error('Sync failed', e);
    }
  };

  const pushChanges = async (doc: Y.Doc) => {
    try {
      let update: Uint8Array;
      const lastVectorB64 = localStorage.getItem('zodiac-last-vector');

      if (lastVectorB64) {
        const lastVector = base64ToUint8(lastVectorB64);
        update = Y.encodeStateAsUpdate(doc, lastVector);
      } else {
        update = Y.encodeStateAsUpdate(doc);
      }

      const base64Update = uint8ToBase64(update);

      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update: base64Update }),
      });

      const newVector = Y.encodeStateVector(doc);
      localStorage.setItem('zodiac-last-vector', uint8ToBase64(newVector));
    } catch (e) {
      console.error('Push failed', e);
    }
  };

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;

    const yArray = doc.getArray<Y.Map<any>>('entries');
    arrayRef.current = yArray;

    // Correct provider (this was the only change needed)
    const provider = new IndexeddbPersistence('zodiac-commons', doc);
    providerRef.current = provider;

    provider.whenSynced.then(() => {
      updateUI();
      syncWithServer(doc).then(() => {
        updateUI();
        setIsLoading(false);
      });
    });

    const observer = () => updateUI();
    yArray.observe(observer);

    return () => {
      yArray.unobserve(observer);
      provider.destroy();
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !arrayRef.current) return;

    const entry = new Y.Map();
    entry.set('name', name.trim());
    entry.set('sign', selectedSign);
    arrayRef.current.push([entry]);

    await pushChanges(docRef.current!);
    setName('');
  };

  const handleDownload = () => {
    if (!arrayRef.current) return;
    const data = arrayRef.current.toArray().map((map: Y.Map<any>) => ({
      name: map.get('name'),
      sign: map.get('sign'),
    }));
    const yamlStr = yaml.stringify(data);
    const blob = new Blob([yamlStr], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zodiac-commons.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-4xl font-bold text-center mb-2">♋ Zodiac Data Commons</h1>
      <p className="text-center text-zinc-400 mb-8">Non-real-time collaborative list • Add your name &amp; sign • Download as YAML</p>

      {/* Form */}
      <form onSubmit={handleAdd} className="bg-zinc-900 p-6 rounded-2xl mb-8 flex gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
          required
        />
        <select
          value={selectedSign}
          onChange={(e) => setSelectedSign(e.target.value as any)}
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
        >
          {ZODIAC_SIGNS.map(sign => (
            <option key={sign} value={sign}>{sign}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-amber-400 hover:bg-amber-300 transition-colors text-zinc-950 font-semibold px-8 rounded-xl"
        >
          Add
        </button>
      </form>

      {/* List */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Shared Entries ({entries.length})</h2>
          <button
            onClick={handleDownload}
            className="text-sm flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
          >
            ⬇️ Download YAML
          </button>
        </div>

        {isLoading ? (
          <p className="text-zinc-400 text-center py-12">Loading shared data…</p>
        ) : entries.length === 0 ? (
          <p className="text-zinc-400 text-center py-12">No entries yet. Be the first to add one!</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, i) => (
              <li key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex justify-between items-center">
                <span className="font-medium">{entry.name}</span>
                <span className="text-amber-300 font-mono text-sm">{entry.sign}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-zinc-500">
        Powered by Yjs + Vercel Postgres • Changes sync when you open the page
      </p>
    </div>
  );
}
