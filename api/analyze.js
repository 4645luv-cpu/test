/*
 * 楽譜写真の解析API (Vercel Serverless Function)
 * 受け取った画像を Claude (vision) に渡し、音符・調号・楽器情報を
 * 構造化JSONで返す。ANTHROPIC_API_KEY を環境変数に設定して使う。
 */
const Anthropic = require('@anthropic-ai/sdk');

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// 注意: 構造化出力のスキーマは型のユニオン(["string","null"])に対応していないため、
// 「なし」は空文字列で表現する
const SCHEMA = {
  type: 'object',
  properties: {
    isSheetMusic: { type: 'boolean' },
    title: { type: 'string' },
    detectedInstrument: { type: 'string' },
    sourceTransposition: { type: 'string', enum: ['C', 'Bb', 'Eb', 'F', 'unknown'] },
    clef: { type: 'string', enum: ['treble', 'bass'] },
    keyFifths: { type: 'integer' },
    timeSignature: {
      type: 'object',
      properties: {
        numerator: { type: 'integer' },
        denominator: { type: 'integer' },
      },
      required: ['numerator', 'denominator'],
      additionalProperties: false,
    },
    measures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          notes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rest: { type: 'boolean' },
                pitch: { type: 'string' },
                duration: { type: 'string', enum: ['w', 'h', 'q', '8', '16', '32'] },
                dotted: { type: 'boolean' },
              },
              required: ['rest', 'pitch', 'duration', 'dotted'],
              additionalProperties: false,
            },
          },
        },
        required: ['notes'],
        additionalProperties: false,
      },
    },
    warnings: { type: 'string' },
  },
  required: [
    'isSheetMusic', 'title', 'detectedInstrument', 'sourceTransposition',
    'clef', 'keyFifths', 'timeSignature', 'measures', 'warnings',
  ],
  additionalProperties: false,
};

// 書き込みモード用スキーマ: 音符の座標と音名だけを返す(リズムは読まない)
const OVERLAY_SCHEMA = {
  type: 'object',
  properties: {
    isSheetMusic: { type: 'boolean' },
    detectedInstrument: { type: 'string' },
    sourceTransposition: { type: 'string', enum: ['C', 'Bb', 'Eb', 'F', 'unknown'] },
    keyFifths: { type: 'integer' },
    staffLineGap: { type: 'integer' },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'integer' },
          y: { type: 'integer' },
          pitch: { type: 'string' },
        },
        required: ['x', 'y', 'pitch'],
        additionalProperties: false,
      },
    },
    warnings: { type: 'string' },
  },
  required: [
    'isSheetMusic', 'detectedInstrument', 'sourceTransposition',
    'keyFifths', 'staffLineGap', 'notes', 'warnings',
  ],
  additionalProperties: false,
};

const OVERLAY_PROMPT = `この画像は楽譜の写真です。メロディー(主旋律)の各音符について、符頭(音符の玉)の中心のピクセル座標と音名をJSONで返してください。目的は、元の楽譜の各音符の真下にカタカナのドレミを書き込むことです。

ルール:
- メロディーの特定: 1段譜ならその段。ピアノ譜(大譜表)なら上段(ト音記号)の最上声だけを追う。伴奏・和音の下側の音・低音部(ヘ音記号)の段は完全に無視する。
- すべての段(システム)を上から順に、各段内は左から右へ読み取る。
- x, y は符頭の中心のピクセル座標。画像の左上が原点 (0,0)。座標は正確に。
- pitch は「書かれている音」の科学的音名(例: "C4", "F#5", "Bb3")。中央ドは C4。
- 調号による変化(例: 調号に♯があればその音は♯)と臨時記号を pitch に反映する。臨時記号は同じ小節内の同じ高さの音に引き続き適用される。
- 五線上の位置を慎重に確認すること: 符頭が「線上」か「線間」か、加線の数を数えて音高を決める。
- 休符・装飾音符・歌詞・コード記号は含めない。タイで結ばれた2音目以降は含めなくてよい。
- staffLineGap: 五線の隣り合う線と線の間隔(ピクセル)の概算値。
- keyFifths は調号のシャープの数(フラットは負の数)。例: ハ長調=0, ト長調=1, ヘ長調=-1, 変ロ長調=-2。
- detectedInstrument: 楽器名の記載があればそのまま。なければ空文字列 ""。
- sourceTransposition: 楽器名や文脈からこの譜が何管かを判断する。
  C管(ピアノ/フルート/バイオリン/オーボエ/歌など)="C"、B♭管(トランペット/クラリネット/テナーサックス/ソプラノサックス)="Bb"、
  E♭管(アルトサックス/バリトンサックス)="Eb"、F管(ホルン/イングリッシュホルン)="F"。判断材料がなければ "unknown"。
- 最大200音まで。超える場合は先頭から200音で打ち切り、warnings にその旨を書く。
- 楽譜が写っていない画像なら isSheetMusic:false、notes は空配列。
- 読み取りに自信がない箇所があれば warnings に日本語で簡潔に書く。なければ空文字列 ""。`;

const PROMPT = `この画像は楽譜の写真です。光学楽譜認識(OMR)を行い、内容をJSONで書き起こしてください。

ルール:
- メロディー(主旋律)を1声のみ書き起こす。1段譜ならその段。ピアノ譜(大譜表)なら上段(ト音記号)の最上声だけを追い、伴奏・和音の下側の音・低音部(ヘ音記号)の段は完全に無視する。
- まず全体の構造(段の数・小節の数・拍子・調号)を把握してから、段ごとに書き起こす。
- pitch は「書かれている音」を科学的音名で表記する(例: "C4", "F#5", "Bb3")。中央ドは C4。
- 五線上の位置を慎重に確認すること: 符頭が「線上」か「線間」か、加線の数を数えて音高を決める。
- 調号による変化(例: ト長調のF→F#)と臨時記号を pitch に反映させること。臨時記号は同じ小節内の同じ音に引き続き適用される。
- duration: 全音符=w, 2分=h, 4分=q, 8分=8, 16分=16, 32分=32。付点は dotted:true。
- 連桁でつながった16分音符の連なりは、音符の数を1つずつ注意深く数えること。
- 各小節を書き終えたら、音価の合計が拍子と一致するか検算し、合わなければその小節を読み直す。
- 3連符はこの形式では表現できないため、最も近い音価で近似し、warnings に「3連符を近似した」と書く。
- 休符は rest:true とし、pitch は空文字列 "" にする。
- keyFifths は調号のシャープの数(フラットは負の数)。例: ハ長調=0, ト長調=1, ヘ長調=-1, 変ロ長調=-2。
- title: 曲名の記載があればそのまま書く。なければ空文字列 ""。
- detectedInstrument: 楽譜に楽器名の記載があればそのまま書く。なければ空文字列 ""。
- sourceTransposition: 楽器名や文脈からこの譜が何管かを判断する。
  C管(ピアノ/フルート/バイオリン/オーボエ/歌など)="C"、B♭管(トランペット/クラリネット/テナーサックス/ソプラノサックス)="Bb"、
  E♭管(アルトサックス/バリトンサックス)="Eb"、F管(ホルン/イングリッシュホルン)="F"。判断材料がなければ "unknown"。
- 複数の段がある場合はすべての段を順番に書き起こす(最大64小節まで)。
- 歌詞・コード記号・強弱記号は無視してよい。
- 楽譜が写っていない画像の場合は isSheetMusic:false とし、measures は空配列にする。
- 読み取りに自信がない箇所があれば warnings に日本語で簡潔に書く。なければ空文字列 ""。`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // ヘルスチェック: APIキーが設定済みか・有効かを返す(キーの値は返さない)
  if (req.method === 'GET') {
    const configured = !!process.env.ANTHROPIC_API_KEY;
    let keyValid = null;
    if (configured) {
      try {
        await new Anthropic().models.retrieve('claude-opus-4-8');
        keyValid = true;
      } catch (e) {
        keyValid = e instanceof Anthropic.AuthenticationError ? false : null;
      }
    }
    res.status(200).json({ ok: true, keyConfigured: configured, keyValid });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'POSTで送信してください。' });
    return;
  }

  const { image, mediaType, apiKey, validate, mode } = req.body || {};

  // ブラウザから渡されたキー(なければサーバーの環境変数)を使う
  const userKey = (typeof apiKey === 'string' && /^sk-ant-[\w-]{20,}$/.test(apiKey.trim())) ? apiKey.trim() : null;
  const key = userKey || process.env.ANTHROPIC_API_KEY || null;

  if (!key) {
    const message = (apiKey && !userKey)
      ? 'APIキーの形式が正しくありません。「sk-ant-」で始まるキーを貼り付けてください。'
      : 'APIキーが設定されていません。アプリ画面の「APIキー設定」に貼り付けてください。';
    res.status(401).json({ error: 'no_api_key', message });
    return;
  }

  const client = new Anthropic({ apiKey: key });

  // キーの有効性チェックだけを行うモード(画面の「保存」ボタンから呼ばれる)
  if (validate === true) {
    try {
      await client.models.retrieve('claude-opus-4-8');
      res.status(200).json({ ok: true, keyValid: true });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        res.status(200).json({ ok: true, keyValid: false });
      } else {
        res.status(200).json({ ok: true, keyValid: null });
      }
    }
    return;
  }

  if (!image || typeof image !== 'string' || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: 'bad_request', message: '画像データが不正です。' });
    return;
  }

  const isOverlay = mode === 'overlay';

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: isOverlay ? OVERLAY_SCHEMA : SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: isOverlay ? OVERLAY_PROMPT : PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: 'refused', message: 'この画像は解析できませんでした。別の画像でお試しください。' });
      return;
    }
    if (response.stop_reason === 'max_tokens') {
      res.status(422).json({ error: 'too_long', message: '楽譜が長すぎて解析しきれませんでした。ページを分割して撮影してください。' });
      return;
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'empty_response', message: '解析結果を取得できませんでした。もう一度お試しください。' });
      return;
    }

    const data = JSON.parse(textBlock.text);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(401).json({ error: 'bad_api_key', message: 'APIキーが無効です。「APIキー設定」で正しいキーを設定し直してください。' });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'rate_limited', message: 'アクセスが集中しています。少し待ってからもう一度お試しください。' });
    } else if (err instanceof Anthropic.APIConnectionError) {
      res.status(502).json({ error: 'connection', message: 'AIサービスに接続できませんでした。もう一度お試しください。' });
    } else if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      const detail = String(err.message || '').slice(0, 300);
      res.status(502).json({
        error: 'api_error',
        message: `解析中にエラーが発生しました (${err.status})。${detail ? `詳細: ${detail}` : 'もう一度お試しください。'}`,
      });
    } else {
      console.error(err);
      res.status(500).json({ error: 'internal', message: '解析中にエラーが発生しました。もう一度お試しください。' });
    }
  }
};
