import asyncio
import threading
from datetime import datetime
import uuid

from flask import Flask, jsonify, request
from flask_cors import CORS

from detoxify import Detoxify

from winrt.windows.ui.notifications.management import (
    UserNotificationListener
)
from winrt.windows.ui.notifications import NotificationKinds


# =========================================================
# CIVILI CONFIGURATION
# =========================================================

app = Flask(__name__)
CORS(app)

latest_evidence = None
seen = set()

print("CIVILI: Loading NLP model...")

model = Detoxify("original")

print("CIVILI: NLP model ready.")


# =========================================================
# NLP ANALYSIS
# =========================================================

def analyze_content(text):

    if not text or not text.strip():

        return {
            "harmful": False,
            "risk": "NOT ASSESSED",
            "scores": {},
            "intent": "No content provided",
            "confidence": 0
        }

    try:

        results = model.predict(text)

        toxicity = float(
            results["toxicity"]
        )

        severe_toxicity = float(
            results["severe_toxicity"]
        )

        obscene = float(
            results["obscene"]
        )

        threat = float(
            results["threat"]
        )

        insult = float(
            results["insult"]
        )

        # =====================================================
        # CIVILI HARMFUL CONTENT DECISION
        # =====================================================

        harmful = (
            toxicity >= 0.70
            or severe_toxicity >= 0.70
            or threat >= 0.60
            or insult >= 0.75
        )

        # =====================================================
        # RISK CLASSIFICATION
        # =====================================================

        if (
            threat >= 0.60
            or severe_toxicity >= 0.70
        ):

            risk = "HIGH"

        elif (
            toxicity >= 0.70
            or insult >= 0.75
        ):

            risk = "MEDIUM"

        else:

            risk = "LOW"

        # =====================================================
        # INTENT CLASSIFICATION
        # =====================================================

        if threat >= 0.60:

            intent = (
                "Threat / Harmful Intent"
            )

        elif insult >= 0.75:

            intent = (
                "Harassment / Insult"
            )

        elif obscene >= 0.70:

            intent = (
                "Obscene / Abusive Content"
            )

        elif toxicity >= 0.70:

            intent = (
                "Toxic / Harmful Content"
            )

        else:

            intent = (
                "No Significant Harm Detected"
            )

        # =====================================================
        # CONFIDENCE
        # =====================================================

        confidence = max(
            toxicity,
            severe_toxicity,
            threat,
            insult
        )

        return {

            "harmful": harmful,

            "risk": risk,

            "intent": intent,

            "confidence": round(
                confidence,
                3
            ),

            "scores": {

                "toxicity":
                    round(
                        toxicity,
                        3
                    ),

                "severe_toxicity":
                    round(
                        severe_toxicity,
                        3
                    ),

                "obscene":
                    round(
                        obscene,
                        3
                    ),

                "threat":
                    round(
                        threat,
                        3
                    ),

                "insult":
                    round(
                        insult,
                        3
                    )
            }
        }

    except Exception as error:

        print(
            "NLP analysis error:",
            error
        )

        return {

            "harmful": False,

            "risk": "ANALYSIS ERROR",

            "scores": {},

            "intent":
                "Analysis failed",

            "confidence": 0
        }


# =========================================================
# MANUAL + SCREENSHOT AI ANALYSIS API
# =========================================================

@app.route(
    "/analyze",
    methods=["POST"]
)
def analyze_submitted_content():

    global latest_evidence

    try:

        data = request.get_json()

        if not data:

            return jsonify({

                "success": False,

                "error":
                    "No JSON data received"

            }), 400

        text = str(
            data.get(
                "text",
                ""
            )
        ).strip()

        source = data.get(
            "source",
            "Manual Entry"
        )

        capture_method = data.get(
            "capture_method",
            "Manual Entry"
        )

        if not text:

            return jsonify({

                "success": False,

                "error":
                    "No text provided"

            }), 400

        print()
        print(
            "======================================"
        )
        print(
            "      CIVILI SUBMITTED EVIDENCE"
        )
        print(
            "======================================"
        )

        print(
            "Source:",
            source
        )

        print(
            "Method:",
            capture_method
        )

        print(
            "Content:",
            text
        )

        # =====================================================
        # SAME DETOXIFY ENGINE
        # =====================================================

        analysis = analyze_content(
            text
        )

        timestamp = datetime.now().isoformat(
            timespec="seconds"
        )

        evidence_id = (
            "CIV-2026-"
            + uuid.uuid4().hex[:8].upper()
        )

        # =====================================================
        # CREATE EVIDENCE
        # =====================================================

        latest_evidence = {

            "id":
                evidence_id,

            "source":
                source,

            "content":
                text,

            "timestamp":
                timestamp,

            "capture_method":
                capture_method,

            "risk":
                analysis["risk"],

            "intent":
                analysis["intent"],

            "confidence":
                analysis["confidence"],

            "scores":
                analysis["scores"]

        }

        print()
        print(
            "CIVILI NLP RESULT:",
            analysis["risk"]
        )

        print(
            "Intent:",
            analysis["intent"]
        )

        print(
            "Confidence:",
            round(
                analysis["confidence"] * 100,
                2
            ),
            "%"
        )

        print(
            "NLP Scores:",
            analysis["scores"]
        )

        if analysis["harmful"]:

            print(
                "🚨 HARMFUL CONTENT DETECTED"
            )

            print(
                "ACTION: PRESERVE AS EVIDENCE"
            )

        else:

            print(
                "CIVILI NLP RESULT: SAFE"
            )

            print(
                "ACTION: CONTENT NOT FLAGGED"
            )

        print(
            "--------------------------------------"
        )

        return jsonify({

            "success":
                True,

            "harmful":
                analysis["harmful"],

            "evidence":
                latest_evidence

        })

    except Exception as error:

        print(
            "Submitted analysis error:",
            error
        )

        return jsonify({

            "success":
                False,

            "error":
                str(error)

        }), 500


# =========================================================
# WINDOWS NOTIFICATION LISTENER
# =========================================================

async def notification_listener():

    global latest_evidence

    listener = (
        UserNotificationListener.current
    )

    print()
    print(
        "======================================"
    )
    print(
        "       CIVILI NOTIFICATION BRIDGE"
    )
    print(
        "======================================"
    )

    print(
        "Access status:",
        listener.get_access_status()
    )

    print(
        "Privacy mode: ACTIVE"
    )

    print(
        "Only harmful content is preserved."
    )

    print(
        "Listening for notifications..."
    )

    print(
        "--------------------------------------"
    )

    while True:

        try:

            notifications = (
                await listener.get_notifications_async(
                    NotificationKinds.TOAST
                )
            )

            for notification in notifications:

                if notification.id in seen:

                    continue

                seen.add(
                    notification.id
                )

                text = ""

                # =================================================
                # EXTRACT NOTIFICATION TEXT
                # =================================================

                try:

                    binding = (
                        notification
                        .notification
                        .visual
                        .get_binding(
                            "ToastGeneric"
                        )
                    )

                    if binding:

                        elements = (
                            binding
                            .get_text_elements()
                        )

                        texts = []

                        for element in elements:

                            if element.text:

                                texts.append(
                                    element.text
                                )

                        text = " | ".join(
                            texts
                        )

                except Exception as error:

                    print(
                        "Text extraction error:",
                        error
                    )

                # =================================================
                # AI ANALYSIS
                # =================================================

                analysis = analyze_content(
                    text
                )

                print()
                print(
                    "Notification received."
                )

                # =================================================
                # PRIVACY MODE
                # =================================================

                if not analysis["harmful"]:

                    print(
                        "CIVILI NLP RESULT: SAFE"
                    )

                    print(
                        "Action: DISCARDED"
                    )

                    print(
                        "--------------------------------------"
                    )

                    continue

                # =================================================
                # HARMFUL NOTIFICATION
                # =================================================

                timestamp = (
                    datetime.now()
                    .isoformat(
                        timespec="seconds"
                    )
                )

                latest_evidence = {

                    "id":
                        notification.id,

                    "source":
                        "WhatsApp",

                    "content":
                        text,

                    "timestamp":
                        timestamp,

                    "capture_method":
                        "Automatic Notification",

                    "risk":
                        analysis["risk"],

                    "intent":
                        analysis["intent"],

                    "confidence":
                        analysis["confidence"],

                    "scores":
                        analysis["scores"]

                }

                print()
                print(
                    "🚨 CIVILI HARMFUL CONTENT DETECTED"
                )

                print(
                    "--------------------------------------"
                )

                print(
                    "Content:",
                    text
                )

                print(
                    "Risk:",
                    analysis["risk"]
                )

                print(
                    "Intent:",
                    analysis["intent"]
                )

                print(
                    "Confidence:",
                    round(
                        analysis["confidence"] * 100,
                        2
                    ),
                    "%"
                )

                print(
                    "NLP Scores:",
                    analysis["scores"]
                )

                print(
                    "ACTION: PRESERVE AS EVIDENCE"
                )

                print(
                    "--------------------------------------"
                )

        except Exception as error:

            print(
                "Listener error:",
                error
            )

        await asyncio.sleep(2)


# =========================================================
# START LISTENER THREAD
# =========================================================

def start_listener():

    asyncio.run(
        notification_listener()
    )


# =========================================================
# NOTIFICATION API
# =========================================================

@app.route(
    "/notification",
    methods=["GET"]
)
def get_notification():

    if latest_evidence is None:

        return jsonify({

            "available":
                False

        })

    return jsonify({

        "available":
            True,

        "evidence":
            latest_evidence

    })


# =========================================================
# HEALTH API
# =========================================================

@app.route(
    "/health",
    methods=["GET"]
)
def health():

    return jsonify({

        "status":
            "CIVILI bridge active",

        "nlp":
            "Detoxify / Toxic-BERT",

        "privacy_mode":
            True

    })


# =========================================================
# START CIVILI
# =========================================================

if __name__ == "__main__":

    listener_thread = threading.Thread(
        target=start_listener,
        daemon=True
    )

    listener_thread.start()

    print()
    print(
        "CIVILI API:"
    )

    print(
        "http://127.0.0.1:5000"
    )

    print()

    app.run(

        host="127.0.0.1",

        port=5000,

        debug=False

    )