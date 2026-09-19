import asyncio
import os
import tempfile
import threading
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from detoxify import Detoxify
import whisper

from winrt.windows.ui.notifications.management import UserNotificationListener
from winrt.windows.ui.notifications import NotificationKinds


# =========================================================
# CIVILI CONFIG
# =========================================================

HOST = "127.0.0.1"
PORT = 5000

# Whisper model
# tiny = faster and lighter for prototype/demo
WHISPER_MODEL_NAME = "tiny"


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)
CORS(app)


# =========================================================
# LOAD AI MODELS
# =========================================================

print("CIVILI: Loading NLP model...")
toxicity_model = Detoxify("original")

print("CIVILI: Loading Whisper model...")
whisper_model = whisper.load_model(WHISPER_MODEL_NAME)

print("CIVILI: AI models loaded successfully.")


# =========================================================
# LATEST HARMFUL AUTOMATIC NOTIFICATION
#
# IMPORTANT:
# Only harmful content is placed here.
# Safe content is NEVER stored here.
# =========================================================

latest_evidence = None


# =========================================================
# HELPER — DETOXIFY ANALYSIS
# =========================================================

def analyze_text(text):

    # Text exists only temporarily during analysis.
    text = (text or "").strip()

    if not text:
        return {
            "harmful": False,
            "risk": "LOW",
            "intent": "No content",
            "confidence": 0,
            "scores": {}
        }

    result = toxicity_model.predict(text)

    toxicity = float(
        result.get("toxicity", 0)
    )

    severe_toxicity = float(
        result.get("severe_toxicity", 0)
    )

    threat = float(
        result.get("threat", 0)
    )

    insult = float(
        result.get("insult", 0)
    )

    obscene = float(
        result.get("obscene", 0)
    )


    # =====================================================
    # CIVILI HARMFULNESS THRESHOLDS
    # =====================================================

    harmful = (
        toxicity >= 0.70
        or severe_toxicity >= 0.70
        or threat >= 0.60
        or insult >= 0.75
    )


    # =====================================================
    # RISK
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
    # SIMPLE INTENT LABEL
    # =====================================================

    if threat >= 0.60:

        intent = "Threat"

    elif insult >= 0.75:

        intent = "Harassment / Insult"

    elif obscene >= 0.70:

        intent = "Obscene Content"

    elif toxicity >= 0.70:

        intent = "Toxic / Harmful Content"

    else:

        intent = "Safe Content"


    # =====================================================
    # CONFIDENCE
    # =====================================================

    confidence = max(
        toxicity,
        severe_toxicity,
        threat,
        insult,
        obscene
    )


    return {

        "harmful": harmful,

        "risk": risk,

        "intent": intent,

        "confidence": round(
            confidence * 100,
            2
        ),

        "scores": {

            "toxicity":
                round(
                    toxicity * 100,
                    2
                ),

            "severe_toxicity":
                round(
                    severe_toxicity * 100,
                    2
                ),

            "threat":
                round(
                    threat * 100,
                    2
                ),

            "insult":
                round(
                    insult * 100,
                    2
                ),

            "obscene":
                round(
                    obscene * 100,
                    2
                )
        }
    }


# =========================================================
# /ANALYZE
# TEXT ANALYSIS ENDPOINT
#
# Text is processed temporarily.
# This endpoint itself does NOT store evidence.
# =========================================================

@app.route(
    "/analyze",
    methods=["POST"]
)
def analyze():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        text = data.get(
            "text",
            ""
        )

        source = data.get(
            "source",
            "Manual Entry"
        )

        capture_method = data.get(
            "captureMethod",
            "Manual Entry"
        )


        print(
            "\n--------------------------------------"
        )

        print(
            "CIVILI: Text analysis request"
        )

        print(
            "Source:",
            source
        )

        print(
            "Method:",
            capture_method
        )

        # Privacy:
        # Do NOT print actual message content.
        print(
            "Content: [temporarily processed]"
        )


        # =================================================
        # AI ANALYSIS
        # =================================================

        analysis = analyze_text(
            text
        )


        print(
            "CIVILI NLP RESULT:",
            "HARMFUL"
            if analysis["harmful"]
            else "SAFE"
        )

        print(
            "Risk:",
            analysis["risk"]
        )

        print(
            "Intent:",
            analysis["intent"]
        )


        # =================================================
        # RETURN ANALYSIS
        #
        # This is returned to the frontend for display.
        # It is NOT stored by this backend endpoint.
        # =================================================

        return jsonify({

            "success": True,

            "text":
                text,

            "source":
                source,

            "captureMethod":
                capture_method,

            "harmful":
                analysis["harmful"],

            "risk":
                analysis["risk"],

            "intent":
                analysis["intent"],

            "confidence":
                analysis["confidence"],

            "scores":
                analysis["scores"]
        })


    except Exception as e:

        print(
            "CIVILI /analyze ERROR:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "error":
                str(e)

        }), 500


# =========================================================
# /TRANSCRIBE
#
# AUDIO → WHISPER → TRANSCRIPT
#
# The audio file is temporary.
# It is deleted after processing.
#
# This endpoint is used by the existing React frontend.
# =========================================================

@app.route(
    "/transcribe",
    methods=["POST"]
)
def transcribe():

    temp_path = None

    try:

        # =================================================
        # CHECK FILE
        # =================================================

        if "audio" not in request.files:

            return jsonify({

                "success":
                    False,

                "error":
                    "No audio file supplied."

            }), 400


        audio_file = (
            request.files["audio"]
        )


        if not audio_file.filename:

            return jsonify({

                "success":
                    False,

                "error":
                    "Audio filename is missing."

            }), 400


        print(
            "\n======================================"
        )

        print(
            "🎙️ CIVILI VOICE TRANSCRIPTION"
        )

        print(
            "======================================"
        )

        print(
            "Audio received:",
            audio_file.filename
        )

        print(
            "Starting Whisper transcription..."
        )


        # =================================================
        # SAVE TEMPORARY AUDIO FILE
        # =================================================

        extension = os.path.splitext(
            audio_file.filename
        )[1]


        if not extension:

            extension = ".audio"


        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:

            audio_file.save(
                temp_file.name
            )

            temp_path = temp_file.name


        # =================================================
        # WHISPER
        # =================================================

        result = whisper_model.transcribe(
            temp_path,
            fp16=False
        )


        transcript = (
            result.get(
                "text",
                ""
            )
            .strip()
        )


        detected_language = (
            result.get(
                "language"
            )
        )


        print(
            "Language:",
            detected_language
        )

        # Privacy:
        # Do NOT print actual transcript.
        print(
            "Transcript: [temporarily processed]"
        )


        print(
            "CIVILI: Voice transcription complete."
        )


        print(
            "======================================"
        )


        # =================================================
        # RETURN TRANSCRIPT TO FRONTEND
        #
        # The React frontend needs this temporarily
        # so it can perform /analyze.
        #
        # No evidence is stored here.
        # =================================================

        return jsonify({

            "success":
                True,

            "filename":
                audio_file.filename,

            "transcript":
                transcript,

            "language":
                detected_language
        })


    except Exception as e:

        print(
            "CIVILI /transcribe ERROR:",
            repr(e)
        )


        return jsonify({

            "success":
                False,

            "error":
                str(e)

        }), 500


    finally:

        # =================================================
        # DELETE TEMPORARY AUDIO FILE
        # =================================================

        if temp_path:

            try:

                os.remove(
                    temp_path
                )

                print(
                    "CIVILI: Temporary audio deleted."
                )

            except Exception as cleanup_error:

                print(
                    "CIVILI: Temporary audio cleanup failed:",
                    repr(cleanup_error)
                )


# =========================================================
# /VOICE-ANALYZE
#
# COMPLETE PIPELINE:
#
# Audio
#   ↓
# Temporary file
#   ↓
# Whisper
#   ↓
# Temporary transcript
#   ↓
# Detoxify
#   ↓
# SAFE     → DISCARD
# HARMFUL  → EVIDENCE
#
# =========================================================

@app.route(
    "/voice-analyze",
    methods=["POST"]
)
def voice_analyze():

    temp_path = None

    try:

        # =================================================
        # CHECK AUDIO FILE
        # =================================================

        if "audio" not in request.files:

            return jsonify({

                "success":
                    False,

                "error":
                    "No audio file supplied."

            }), 400


        audio_file = (
            request.files["audio"]
        )


        if not audio_file.filename:

            return jsonify({

                "success":
                    False,

                "error":
                    "Audio filename is missing."

            }), 400


        print(
            "\n======================================"
        )

        print(
            "🎙️ CIVILI VOICE ANALYSIS"
        )

        print(
            "======================================"
        )

        print(
            "Audio received:",
            audio_file.filename
        )


        # =================================================
        # SAVE TEMPORARY AUDIO
        # =================================================

        extension = os.path.splitext(
            audio_file.filename
        )[1]


        if not extension:

            extension = ".audio"


        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:

            audio_file.save(
                temp_file.name
            )

            temp_path = temp_file.name


        # =================================================
        # STEP 1 — WHISPER
        # =================================================

        print(
            "Step 1/2: Speech-to-text..."
        )


        result = whisper_model.transcribe(
            temp_path,
            fp16=False
        )


        transcript = (
            result.get(
                "text",
                ""
            )
            .strip()
        )


        language = (
            result.get(
                "language"
            )
        )


        print(
            "Language:",
            language
        )

        print(
            "Transcript: [temporarily processed]"
        )


        if not transcript:

            return jsonify({

                "success":
                    False,

                "error":
                    "Whisper could not extract speech."

            }), 400


        # =================================================
        # STEP 2 — DETOXIFY
        # =================================================

        print(
            "Step 2/2: CIVILI NLP analysis..."
        )


        analysis = analyze_text(
            transcript
        )


        print(
            "NLP RESULT:",
            "HARMFUL"
            if analysis["harmful"]
            else "SAFE"
        )

        print(
            "Risk:",
            analysis["risk"]
        )

        print(
            "Intent:",
            analysis["intent"]
        )


        # =================================================
        # PRIVACY FILTER
        #
        # IMPORTANT:
        # SAFE VOICE IS NOT RETAINED.
        # =================================================

        if not analysis["harmful"]:

            print(
                "Action: SAFE — DISCARDED"
            )

            print(
                "No evidence created."
            )

            return jsonify({

                "success":
                    True,

                "harmful":
                    False,

                "risk":
                    analysis["risk"],

                "intent":
                    analysis["intent"],

                "confidence":
                    analysis["confidence"],

                "scores":
                    analysis["scores"],

                "message":
                    "Safe content discarded. "
                    "No evidence retained."
            })


        # =================================================
        # ONLY HARMFUL CONTENT REACHES THIS POINT
        # =================================================

        print(
            "Action: HARMFUL — EVIDENCE RETENTION ALLOWED"
        )


        # =================================================
        # GENERATE EVIDENCE ID
        # =================================================

        evidence_id = (
            f"CIV-2026-"
            f"{int(datetime.now().timestamp() * 1000)}"
        )


        timestamp = (
            datetime.now().isoformat()
        )


        print(
            "Evidence ID:",
            evidence_id
        )


        # =================================================
        # RETURN HARMFUL EVIDENCE
        # =================================================

        return jsonify({

            "success":
                True,

            # ---------------------------------------------
            # Voice
            # ---------------------------------------------

            "filename":
                audio_file.filename,

            "language":
                language,

            "transcript":
                transcript,


            # ---------------------------------------------
            # AI
            # ---------------------------------------------

            "harmful":
                True,

            "risk":
                analysis["risk"],

            "intent":
                analysis["intent"],

            "confidence":
                analysis["confidence"],

            "scores":
                analysis["scores"],


            # ---------------------------------------------
            # Evidence
            # ---------------------------------------------

            "id":
                evidence_id,

            "source":
                "Manual Voice Upload",

            "captureMethod":
                "Manual Voice Upload",

            "timestamp":
                timestamp
        })


    except Exception as e:

        print(
            "CIVILI /voice-analyze ERROR:",
            repr(e)
        )


        return jsonify({

            "success":
                False,

            "error":
                str(e)

        }), 500


    finally:

        # =================================================
        # DELETE TEMPORARY SERVER AUDIO
        # =================================================

        if temp_path:

            try:

                os.remove(
                    temp_path
                )

                print(
                    "CIVILI: Temporary voice file deleted."
                )

            except Exception as cleanup_error:

                print(
                    "CIVILI: Temporary voice cleanup failed:",
                    repr(cleanup_error)
                )


# =========================================================
# /NOTIFICATION
#
# FRONTEND POLLING ENDPOINT
#
# latest_evidence contains ONLY harmful notifications.
# =========================================================

@app.route(
    "/notification",
    methods=["GET"]
)
def notification():

    global latest_evidence


    if latest_evidence is None:

        return jsonify({

            "available":
                False
        })


    # ---------------------------------------------
    # Get harmful evidence
    # ---------------------------------------------

    evidence = (
        latest_evidence
    )


    # ---------------------------------------------
    # Consume once
    #
    # After frontend receives it, remove it
    # from backend memory.
    # ---------------------------------------------

    latest_evidence = None


    return jsonify({

        "available":
            True,

        "evidence":
            evidence
    })


# =========================================================
# FLASK SERVER
# =========================================================

def run_flask():

    print(
        f"CIVILI: Flask API running on "
        f"http://{HOST}:{PORT}"
    )


    app.run(

        host=HOST,

        port=PORT,

        debug=False,

        use_reloader=False
    )


# =========================================================
# WINDOWS NOTIFICATION LISTENER
# =========================================================

async def notification_listener():

    global latest_evidence


    listener = (
        UserNotificationListener.current
    )


    print(
        "======================================"
    )

    print(
        "      CIVILI NOTIFICATION BRIDGE"
    )

    print(
        "======================================"
    )


    print(
        "Access status:",
        listener.get_access_status()
    )


    print(
        "Listening for notifications..."
    )


    print(
        "Privacy mode: SAFE CONTENT IS DISCARDED"
    )


    print(
        "--------------------------------------"
    )


    seen = set()


    while True:

        try:

            # =================================================
            # GET WINDOWS NOTIFICATIONS
            # =================================================

            notifications = (
                await listener.get_notifications_async(
                    NotificationKinds.TOAST
                )
            )


            for notification in notifications:

                # ---------------------------------------------
                # Avoid processing same notification repeatedly
                # ---------------------------------------------

                if notification.id in seen:

                    continue


                seen.add(
                    notification.id
                )


                # =================================================
                # APP NAME
                # =================================================

                try:

                    app_name = (
                        notification
                        .app_info
                        .display_info
                        .display_name
                    )

                except Exception:

                    app_name = "Unknown"


                # =================================================
                # EXTRACT TEXT
                # =================================================

                text = ""


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

                        text_elements = (
                            binding
                            .get_text_elements()
                        )


                        texts = []


                        for element in text_elements:

                            if element.text:

                                texts.append(
                                    element.text
                                )


                        text = " | ".join(
                            texts
                        )


                except Exception as e:

                    print(
                        "Notification extraction error:",
                        repr(e)
                    )


                if not text.strip():

                    continue


                # =================================================
                # VOICE NOTIFICATION DETECTION
                #
                # Windows notification gives us something like:
                # "Voice message"
                #
                # It does NOT provide the actual audio data.
                # =================================================

                lower_text = (
                    text.lower()
                )


                voice_notification = (

                    "voice message"
                    in lower_text

                    or

                    "voice note"
                    in lower_text
                )


                if voice_notification:

                    print(
                        "\n🎙️ VOICE NOTIFICATION DETECTED"
                    )

                    print(
                        "Application:",
                        app_name
                    )

                    print(
                        "Content: [temporarily processed]"
                    )

                    print(
                        "Action: Waiting for audio "
                        "capture/upload."
                    )

                    print(
                        "--------------------------------------"
                    )

                    continue


                # =================================================
                # NORMAL TEXT NOTIFICATION
                # =================================================

                print(
                    "\n🔔 NOTIFICATION RECEIVED"
                )

                print(
                    "Application:",
                    app_name
                )

                # Privacy:
                # Do not print the actual notification.
                print(
                    "Content: [temporarily processed]"
                )


                # =================================================
                # TEMPORARY AI ANALYSIS
                # =================================================

                analysis = analyze_text(
                    text
                )


                print(
                    "CIVILI NLP RESULT:",
                    "HARMFUL"
                    if analysis["harmful"]
                    else "SAFE"
                )


                # =================================================
                # PRIVACY FILTER
                #
                # SAFE CONTENT IS IMMEDIATELY DISCARDED.
                # =================================================

                if not analysis["harmful"]:

                    print(
                        "Action: SAFE — DISCARDED"
                    )

                    print(
                        "No evidence retained."
                    )

                    print(
                        "--------------------------------------"
                    )

                    continue


                # =================================================
                # HARMFUL CONTENT
                #
                # ONLY NOW DO WE CREATE EVIDENCE.
                # =================================================

                captured_time = (
                    datetime.now().isoformat()
                )


                latest_evidence = {

                    "id":
                        str(
                            notification.id
                        ),

                    "source":
                        app_name,

                    "captureMethod":
                        "Automatic Notification",

                    "content":
                        text,

                    "timestamp":
                        captured_time,

                    "capturedAt":
                        captured_time,

                    "harmful":
                        True,

                    "risk":
                        analysis["risk"],

                    "intent":
                        analysis["intent"],

                    "confidence":
                        analysis["confidence"],

                    "scores":
                        analysis["scores"]
                }


                print(
                    "Action: HARMFUL EVIDENCE READY"
                )

                print(
                    "Evidence retained temporarily "
                    "until frontend retrieves it."
                )

                print(
                    "--------------------------------------"
                )


        except Exception as e:

            print(
                "\n⚠ Notification polling error:",
                repr(e)
            )


        # =================================================
        # POLL EVERY 2 SECONDS
        # =================================================

        await asyncio.sleep(2)


# =========================================================
# MAIN
# =========================================================

print(
    "CIVILI REGISTERED ROUTES:",
    app.url_map
)


if __name__ == "__main__":

    flask_thread = threading.Thread(

        target=run_flask,

        daemon=True
    )


    flask_thread.start()


    asyncio.run(
        notification_listener()
    )
