import { useEffect, useState } from 'react';
import { LANGUAGES, SETTINGS_LIMITS, WORD_CATEGORIES, type Language, type RoomSettings } from '../shared/types';
import { socket } from '../lib/socket';

const range = ({ min, max }: { min: number; max: number }) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const DRAW_TIMES = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240];

export function SettingsForm({ settings, editable }: { settings: RoomSettings; editable: boolean }) {
  const [custom, setCustom] = useState(settings.customWords.join(', '));
  useEffect(() => setCustom(settings.customWords.join(', ')), [settings.customWords]);

  const update = (patch: Partial<RoomSettings>) => socket.emit('update_settings', patch);
  const num = (key: keyof RoomSettings) => (e: React.ChangeEvent<HTMLSelectElement>) => update({ [key]: Number(e.target.value) });

  return (
    <fieldset className="settings" disabled={!editable}>
      <legend>Settings {!editable && <small>(host only)</small>}</legend>

      <label>
        <span>👥 Players</span>
        <select value={settings.maxPlayers} onChange={num('maxPlayers')}>
          {range(SETTINGS_LIMITS.maxPlayers).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        <span>🌐 Language</span>
        <select value={settings.language} onChange={(e) => update({ language: e.target.value as Language })}>
          {(Object.keys(LANGUAGES) as Language[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGES[l]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>🔁 Rounds</span>
        <select value={settings.rounds} onChange={num('rounds')}>
          {range(SETTINGS_LIMITS.rounds).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        <span>⏱️ Draw time</span>
        <select value={settings.drawTime} onChange={num('drawTime')}>
          {DRAW_TIMES.map((n) => <option key={n} value={n}>{n}s</option>)}
        </select>
      </label>
      <label>
        <span>🔤 Word count</span>
        <select value={settings.wordCount} onChange={num('wordCount')}>
          {range(SETTINGS_LIMITS.wordCount).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        <span>💡 Hints</span>
        <select value={settings.hints} onChange={num('hints')}>
          {range(SETTINGS_LIMITS.hints).map((n) => <option key={n} value={n}>{n === 0 ? 'Off' : n}</option>)}
        </select>
      </label>
      <label>
        <span>🎭 Word mode</span>
        <select value={settings.wordMode} onChange={(e) => update({ wordMode: e.target.value as RoomSettings['wordMode'] })}>
          <option value="normal">Normal</option>
          <option value="hidden">Hidden</option>
          <option value="combination">Combination</option>
        </select>
      </label>
      <label>
        <span>📚 Category</span>
        <select value={settings.category} onChange={(e) => update({ category: e.target.value as RoomSettings['category'] })}>
          {WORD_CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select>
      </label>
      <label>
        <span>🔒 Visibility</span>
        <select value={settings.isPrivate ? 'private' : 'public'} onChange={(e) => update({ isPrivate: e.target.value === 'private' })}>
          <option value="private">Private (invite only)</option>
          <option value="public">Public</option>
        </select>
      </label>

      <label className="custom-words">
        <span>✍️ Custom words</span>
        <textarea
          rows={3}
          placeholder="Comma separated, e.g. rocket ship, pizza, unicorn"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => update({ customWords: custom.split(',') })}
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={settings.customWordsOnly} onChange={(e) => update({ customWordsOnly: e.target.checked })} />
        <span>Use custom words only</span>
      </label>
    </fieldset>
  );
}
