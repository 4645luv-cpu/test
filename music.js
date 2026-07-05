/*
 * 音楽理論ユーティリティ(移調・音名・調号)
 * ブラウザでは window.MusicUtils、Node では module.exports として使える。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MusicUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // 記譜音 → 実音 のオフセット(半音)。concert = written + offset
  const SOURCE_TO_CONCERT = { C: 0, Bb: -2, Eb: -9, F: -7, unknown: 0 };

  // 実音 → 記譜音 のオフセット(半音)。written = concert + offset
  const TARGETS = {
    alto:    { label: 'アルトサックス (E♭)',  offset: 9,  low: 58, high: 90 }, // 記譜 B♭3〜F♯6
    tenor:   { label: 'テナーサックス (B♭)',  offset: 14, low: 58, high: 90 },
    soprano: { label: 'ソプラノサックス (B♭)', offset: 2,  low: 58, high: 90 },
  };

  const KEY_NAMES = {
    '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
    '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
  };

  const SHARP_SPELLING = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_SPELLING  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  const DOREMI = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };

  // "F#4" / "Bb3" / "C4" → MIDI番号。不正なら null
  function pitchToMidi(pitch) {
    const m = /^([A-Ga-g])([#b]{0,2})(-?\d+)$/.exec(String(pitch).trim());
    if (!m) return null;
    const letter = m[1].toUpperCase();
    let acc = 0;
    for (const ch of m[2]) acc += ch === '#' ? 1 : -1;
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + LETTER_SEMITONE[letter] + acc;
  }

  // MIDI番号 → {letter, acc, octave, name} 例: 66 → {letter:'F', acc:'#', octave:4, name:'F#4'}
  function midiToPitch(midi, useSharps) {
    const table = useSharps ? SHARP_SPELLING : FLAT_SPELLING;
    const pc = ((midi % 12) + 12) % 12;
    const spelled = table[pc];
    const letter = spelled[0];
    const acc = spelled.slice(1);
    // Cb/B# は出さない綴りなのでオクターブは単純計算で正しい
    const octave = Math.floor(midi / 12) - 1;
    return { letter, acc, octave, name: spelled + octave };
  }

  // 半音シフト量 → 五度圏上の移動量(-6..+6 に正規化)
  function fifthsDelta(semitones) {
    let d = (((semitones % 12) + 12) % 12) * 7 % 12; // 0..11
    if (d > 6) d -= 12;
    return d;
  }

  // 調号(五度圏 -7..7)をシフト。範囲を超えたら異名同音で折り返す
  function transposeFifths(fifths, semitones) {
    let f = (fifths || 0) + fifthsDelta(semitones);
    while (f > 6) f -= 12;
    while (f < -6) f += 12;
    return f;
  }

  function keyName(fifths) {
    return KEY_NAMES[String(fifths)] || 'C';
  }

  // 元の楽器キーと出力先から半音シフト量を求める
  function semitoneShift(sourceKey, targetId) {
    const src = SOURCE_TO_CONCERT[sourceKey] !== undefined ? SOURCE_TO_CONCERT[sourceKey] : 0;
    const tgt = TARGETS[targetId] || TARGETS.alto;
    return src + tgt.offset;
  }

  // 音域に収まるよう全体をオクターブ調整(はみ出す音が最少になる k を選ぶ)
  function bestOctaveAdjust(midis, low, high) {
    if (!midis.length) return 0;
    let best = 0, bestScore = Infinity;
    for (const k of [-24, -12, 0, 12, 24]) {
      let out = 0, sum = 0;
      for (const m of midis) {
        const v = m + k;
        if (v < low) out += low - v;
        else if (v > high) out += v - high;
        sum += v;
      }
      // 音域に収めることを最優先、その中で元の移調結果に近いオクターブを選ぶ
      const center = (low + high) / 2;
      const drift = Math.abs(sum / midis.length - center);
      const score = out * 1000 + Math.abs(k) * 10 + drift * 0.1;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    return best;
  }

  /*
   * スコア全体を移調する。
   * measures: [{notes:[{rest,pitch,duration,dotted}]}]
   * 戻り値: {measures, fifths, keyName, shift, octaveAdjust}
   */
  function transposeScore(measures, keyFifths, sourceKey, targetId) {
    const shift = semitoneShift(sourceKey, targetId);
    const tgt = TARGETS[targetId] || TARGETS.alto;
    const newFifths = transposeFifths(keyFifths, shift);
    const useSharps = newFifths >= 0;

    const midis = [];
    for (const meas of measures) {
      for (const n of meas.notes) {
        if (!n.rest && n.pitch) {
          const m = pitchToMidi(n.pitch);
          if (m !== null) midis.push(m + shift);
        }
      }
    }
    const octaveAdjust = bestOctaveAdjust(midis, tgt.low, tgt.high);

    const out = measures.map((meas) => ({
      notes: meas.notes.map((n) => {
        if (n.rest || !n.pitch) {
          return { rest: true, duration: n.duration, dotted: !!n.dotted };
        }
        const midi = pitchToMidi(n.pitch);
        if (midi === null) {
          return { rest: true, duration: n.duration, dotted: !!n.dotted };
        }
        const p = midiToPitch(midi + shift + octaveAdjust, useSharps);
        return {
          rest: false,
          pitch: p.name,
          letter: p.letter,
          acc: p.acc,
          octave: p.octave,
          doremi: doremi(p.letter, p.acc),
          duration: n.duration,
          dotted: !!n.dotted,
        };
      }),
    }));

    return { measures: out, fifths: newFifths, keyName: keyName(newFifths), shift, octaveAdjust };
  }

  function doremi(letter, acc) {
    let s = DOREMI[letter] || '';
    if (acc === '#') s += '♯';
    else if (acc === '##') s += '𝄪';
    else if (acc === 'b') s += '♭';
    else if (acc === 'bb') s += '𝄫';
    return s;
  }

  return {
    LETTER_SEMITONE,
    SOURCE_TO_CONCERT,
    TARGETS,
    pitchToMidi,
    midiToPitch,
    fifthsDelta,
    transposeFifths,
    keyName,
    semitoneShift,
    bestOctaveAdjust,
    transposeScore,
    doremi,
  };
});
