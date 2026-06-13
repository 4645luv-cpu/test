import os
import base64
from flask import Flask, request, jsonify
from anthropic import Anthropic

app = Flask(__name__)

SYSTEM_PROMPT = "あなたは楽譜読み取りと音楽理論の専門家です。画像から楽譜を正確に読み取り、移調したABC記譜法を出力します。"

USER_PROMPT = """この楽譜の画像を分析し、アルトサックス用に移調してください。

【アルトサックスの移調ルール】
アルトサックスはE♭管です。コンサートピッチ（ピアノ）から長6度上（+9半音）に移調します。

調号の変換：
- C長調 → A長調 (###)
- G長調 → E長調 (####)
- D長調 → B長調 (#####)
- A長調 → F#長調 (######)
- F長調 → D長調 (##)
- B♭長調 → G長調 (#)
- E♭長調 → C長調
- A♭長調 → F長調 (b)
- D♭長調 → B♭長調 (bb)
- C短調 → A短調
- G短調 → E短調
- D短調 → B短調

【出力形式】
以下のABC記譜法の形式で出力してください。説明文は一切不要です。

X:1
T:[曲名があれば記載、なければ「Alto Saxophone Part」] (Alto Saxophone)
C:Transposed for Alto Sax (Concert pitch +9 semitones)
M:[拍子 例: 4/4, 3/4, 6/8]
L:1/8
Q:1/4=[テンポ指示があれば数値、なければ120]
K:[移調後の調記号 例: Amaj, Emin, Gmaj]
[移調した音符を記述]

ABC記譜法の音符規則：
- 音符: C D E F G A B（低音域）, c d e f g a b（高音域）
- シャープ: ^C, フラット: _C
- 音符の長さ: C=1/8, C2=1/4, C4=1/2, C8=全音符
- 休符: z（1/8）, z2（1/4）, z4（1/2）, z8（全休符）
- 小節線: |
- リピート: |: :|
- 付点: C>D（付点+短縮ペア）

楽譜が読み取れない場合は「X:1\nT:Error\nM:4/4\nL:1/8\nK:C\nz4|]」のみ出力してください。
ABC記譜法のテキストのみを出力し、他のテキストや説明は一切含めないでください。"""


def clean_abc(text: str) -> str:
    text = text.strip()
    if "```" in text:
        lines = text.split("\n")
        cleaned = []
        in_block = False
        for line in lines:
            if line.strip().startswith("```"):
                in_block = not in_block
                continue
            cleaned.append(line)
        text = "\n".join(cleaned).strip()
    if not text.startswith("X:"):
        idx = text.find("X:")
        if idx != -1:
            text = text[idx:]
    return text


@app.route("/api/transpose", methods=["POST"])
@app.route("/", methods=["POST"])
def transpose():
    if "image" not in request.files:
        return jsonify({"error": "画像ファイルが必要です"}), 400

    image_file = request.files["image"]
    if not image_file.filename:
        return jsonify({"error": "有効な画像ファイルを選択してください"}), 400

    content_type = image_file.content_type or "image/jpeg"
    if content_type not in ["image/jpeg", "image/png", "image/gif", "image/webp"]:
        content_type = "image/jpeg"

    image_data = base64.standard_b64encode(image_file.read()).decode("utf-8")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY が設定されていません"}), 500

    try:
        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": content_type,
                                "data": image_data,
                            },
                        },
                        {"type": "text", "text": USER_PROMPT},
                    ],
                }
            ],
        )

        abc_notation = clean_abc(message.content[0].text)
        return jsonify({"abc": abc_notation})

    except Exception as e:
        return jsonify({"error": f"処理中にエラーが発生しました: {str(e)}"}), 500
