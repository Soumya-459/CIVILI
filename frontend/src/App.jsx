import { useEffect, useState } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";

// =========================================================
// CIVILI LOCAL EVIDENCE DATABASE — IndexedDB
// =========================================================
const CIVILI_DB_NAME = "CIVILI_Evidence_DB";
const CIVILI_DB_VERSION = 1;
const CIVILI_STORE_NAME = "evidence";

const openEvidenceDB = () => new Promise((resolve, reject) => {
  if (!window.indexedDB) {
    reject(new Error("IndexedDB is not supported by this browser."));
    return;
  }
  const request = window.indexedDB.open(CIVILI_DB_NAME, CIVILI_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(CIVILI_STORE_NAME)) {
      const store = db.createObjectStore(CIVILI_STORE_NAME, { keyPath: "id" });
      store.createIndex("timestamp", "timestamp");
      store.createIndex("risk", "risk");
      store.createIndex("source", "source");
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveEvidenceToDB = async (evidence) => {
  const db = await openEvidenceDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CIVILI_STORE_NAME, "readwrite");
    const request = transaction.objectStore(CIVILI_STORE_NAME).put(evidence);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

const getAllEvidenceFromDB = async () => {
  const db = await openEvidenceDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CIVILI_STORE_NAME, "readonly");
    const request = transaction.objectStore(CIVILI_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const computeSHA256 = async (value) => {
  let buffer;
  if (value instanceof ArrayBuffer) buffer = value;
  else if (value instanceof Blob) buffer = await value.arrayBuffer();
  else buffer = new TextEncoder().encode(String(value ?? "")).buffer;

  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

function App() {

  // =========================================================
  // UI STATE
  // =========================================================

  const [showCapture, setShowCapture] =
    useState(false);

  const [showAnalysis, setShowAnalysis] =
    useState(false);

  const [source, setSource] =
    useState("");

  const [method, setMethod] =
    useState("");

  const [selectedFile, setSelectedFile] =
    useState(null);

  // =========================================================
  // EVIDENCE STATE
  // =========================================================

  const [fileHash, setFileHash] =
    useState("");

  const [capturedAt, setCapturedAt] =
    useState("");

  const [evidenceId, setEvidenceId] =
    useState("");

  const [ocrText, setOcrText] =
    useState("");

  const [analysisStatus, setAnalysisStatus] =
    useState("NOT STARTED");

  const [riskLevel, setRiskLevel] =
    useState("NOT ASSESSED");

  const [detectedIntent, setDetectedIntent] =
    useState("NOT ASSESSED");

  const [confidence, setConfidence] =
    useState(0);

  const [ocrProgress, setOcrProgress] =
    useState(0);

  const [notificationScores, setNotificationScores] =
    useState({});

  // =========================================================
  // LOCAL EVIDENCE DATABASE STATE
  // =========================================================

  const [evidenceDatabase, setEvidenceDatabase] =
    useState([]);

  const [databaseLoading, setDatabaseLoading] =
    useState(true);

  // =========================================================
  // MANUAL ENTRY STATE
  // =========================================================

  const [manualText, setManualText] =
    useState("");

  const [manualSender, setManualSender] =
    useState("");

  const [manualAnalyzing, setManualAnalyzing] =
    useState(false);

  // =========================================================
  // VOICE EVIDENCE STATE
  // =========================================================
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [voiceAnalyzing, setVoiceAnalyzing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("");
  const [voiceError, setVoiceError] = useState("");

  // =========================================================
  // LOAD LOCAL EVIDENCE DATABASE
  // =========================================================

  useEffect(() => {
    const loadEvidenceDatabase = async () => {
      try {
        const records = await getAllEvidenceFromDB();
        records.sort((a, b) =>
          new Date(b.timestamp || 0).getTime() -
          new Date(a.timestamp || 0).getTime()
        );
        setEvidenceDatabase(records);
      } catch (error) {
        console.error(
          "CIVILI: Failed to load local evidence database:",
          error
        );
      } finally {
        setDatabaseLoading(false);
      }
    };
    loadEvidenceDatabase();
  }, []);

  // =========================================================
  // COMMON CIVILI AI RESULT HANDLER
  // =========================================================
  // This keeps Screenshot, Manual Entry and Notification
  // using the SAME result format from Python.
  // =========================================================

  const applyEvidenceResult = (
    evidence,
    fallbackText = ""
  ) => {

    if (!evidence) {
      return;
    }

    // =====================================================
    // CONTENT
    // =====================================================

    setOcrText(
      evidence.content ||
      fallbackText ||
      ""
    );

    // =====================================================
    // SOURCE
    // =====================================================

    setSource(
      evidence.source ||
      (method === "notification" ? "WhatsApp" : "Screenshot")
    );

    // =====================================================
    // RISK
    // =====================================================

    setRiskLevel(
      evidence.risk ||
      "NOT ASSESSED"
    );

    // =====================================================
    // INTENT
    // =====================================================

    setDetectedIntent(
      evidence.intent ||
      "NOT ASSESSED"
    );

    // =====================================================
    // CONFIDENCE
    // =====================================================

    setConfidence(
      Math.round(
        (Number(evidence.confidence) || 0)
      )
    );

    // =====================================================
    // NLP SCORES
    // =====================================================
    console.log("RAW SCORES FROM PYTHON:", evidence.scores);
    setNotificationScores(
      evidence.scores ||
      {}
    );

    // =====================================================
    // TIMESTAMP
    // =====================================================

    if (evidence.timestamp) {

      setCapturedAt(
        new Date(
          evidence.timestamp
        ).toLocaleString()
      );

    }

    // =====================================================
    // EVIDENCE ID
    // =====================================================

    // Python already returns CIV-2026-XXXXXXXX.
    // Do NOT prepend CIV-2026 again.

    setEvidenceId(
      evidence.id ||
      `CIV-2026-${Date.now()}`
    );

    // =====================================================
    // ANALYSIS STATUS
    // =====================================================

    setAnalysisStatus(
      "AI ANALYSIS COMPLETE"
    );

  };

  // =========================================================
  // CIVILI AI ANALYSIS FUNCTION
  // =========================================================
  // Screenshot OCR and Manual Entry both call this.
  // =========================================================

  const analyzeWithCiviliAI = async (
    text,
    evidenceSource,
    captureMethod
  ) => {

    const cleanText =
      (text || "").trim();

    if (!cleanText) {

      alert(
        "No text available for AI analysis."
      );

      return false;

    }

    setAnalysisStatus(
      "AI ANALYSIS IN PROGRESS"
    );

    setRiskLevel(
      "ANALYZING..."
    );

    setDetectedIntent(
      "Analyzing content..."
    );

    setConfidence(0);

    try {

      console.log(
        "CIVILI: Sending content to Python AI engine..."
      );

      console.log(
        "Source:",
        evidenceSource
      );

      console.log(
        "Capture Method:",
        captureMethod
      );

      const response =
        await fetch(
          "http://127.0.0.1:5000/analyze",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json"

            },

            body: JSON.stringify({

              text:
                cleanText,

              source:
                evidenceSource ||
                "Unknown",

              capture_method:
                captureMethod ||
                "Manual Entry"

            })

          }
        );

      // =====================================================
      // RESPONSE
      // =====================================================

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "CIVILI AI analysis failed."
        );

      }

      const evidence =
        data.evidence || {
          id: data.id || `CIV-2026-${Date.now()}`,
          content: data.text || cleanText,
          source: data.source || evidenceSource || "Unknown",
          captureMethod: data.captureMethod || captureMethod || "Manual Entry",
          harmful: data.harmful,
          risk: data.risk,
          intent: data.intent,
          confidence: Number(data.confidence) || 0,
          scores: data.scores || {},
          timestamp: data.timestamp || new Date().toISOString()
        };

      console.log(
        "CIVILI: AI result received:",
        evidence
      );

      // =====================================================
      // APPLY PYTHON RESULT
      // =====================================================

      applyEvidenceResult(
        evidence,
        cleanText
      );

      return true;

    } catch (error) {

      console.error(
        "CIVILI AI analysis failed:",
        error
      );

      setAnalysisStatus(
        "AI ANALYSIS FAILED"
      );

      setRiskLevel(
        "UNAVAILABLE"
      );

      setDetectedIntent(
        "Analysis failed"
      );

      setConfidence(0);

      alert(
        "CIVILI AI analysis failed.\n\n" +
        "Make sure notification_bridge.py is running on port 5000."
      );

      return false;

    }

  };

  // =========================================================
  // CIVILI VOICE ANALYSIS
  // AUDIO → WHISPER → DETOXIFY → EVIDENCE
  // =========================================================
  const handleVoiceAnalysis = async (file) => {
  if (!file) return;

  setVoiceAnalyzing(true);
  setVoiceError("");
  setVoiceTranscript("");
  setVoiceLanguage("");

  try {
    // STEP 1: Send audio to Whisper
    const formData = new FormData();
    formData.append("audio", file);

    const transcriptionResponse = await fetch(
      "http://127.0.0.1:5000/transcribe",
      {
        method: "POST",
        body: formData,
      }
    );

    const transcriptionText = await transcriptionResponse.text();

    let transcriptionData;
    try {
      transcriptionData = JSON.parse(transcriptionText);
    } catch {
      throw new Error(
        `Transcription API returned non-JSON (${transcriptionResponse.status})`
      );
    }

    if (!transcriptionResponse.ok || !transcriptionData.success) {
      throw new Error(
        transcriptionData.error || "Voice transcription failed."
      );
    }

    const transcript = transcriptionData.transcript || "";

    setVoiceTranscript(transcript);
    setVoiceLanguage(transcriptionData.language || "");

    if (!transcript.trim()) {
      throw new Error("No speech could be detected in the audio.");
    }

    // STEP 2: Send transcript to CIVILI AI analysis
    const analysisResponse = await fetch(
      "http://127.0.0.1:5000/analyze",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: transcript,
          source: "Manual Voice Upload",
          captureMethod: "Manual Voice Upload",
        }),
      }
    );

    const analysisText = await analysisResponse.text();

    let analysisData;
    try {
      analysisData = JSON.parse(analysisText);
    } catch {
      throw new Error(
        `AI analysis API returned non-JSON (${analysisResponse.status})`
      );
    }

    if (!analysisResponse.ok || !analysisData.success) {
      throw new Error(
        analysisData.error || "AI analysis failed."
      );
    }

    // STEP 3: Normalize the backend response
    const evidence =
      analysisData.evidence || {
        id: analysisData.id || `CIV-2026-${Date.now()}`,
        content: analysisData.text || transcript,
        source: analysisData.source || "Manual Voice Upload",
        captureMethod:
          analysisData.captureMethod || "Manual Voice Upload",
        harmful: analysisData.harmful,
        risk: analysisData.risk,
        intent: analysisData.intent,
        confidence: Number(analysisData.confidence) || 0,
        scores: analysisData.scores || {},
        timestamp: analysisData.timestamp || new Date().toISOString(),
      };

    // Store the AI result for the next screen
    applyEvidenceResult(evidence, transcript);

  } catch (error) {
    console.error("Voice analysis error:", error);
    setVoiceError(
      error instanceof Error
        ? error.message
        : "Voice analysis failed."
    );
  } finally {
    setVoiceAnalyzing(false);
  }
};

  const handleVoiceFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      alert("Please select a valid audio file.");
      return;
    }
    setSelectedAudio(file);
    await handleVoiceAnalysis(file);
  };

  // =========================================================
  // CIVILI NOTIFICATION BRIDGE
  // =========================================================

  useEffect(() => {

    const checkForEvidence =
      async () => {

        try {

          const response =
            await fetch(
              "http://127.0.0.1:5000/notification"
            );

          if (!response.ok) {

            return;

          }

          const data =
            await response.json();

          if (
            !data.available ||
            !data.evidence
          ) {

            return;

          }

          const evidence =
            data.evidence;

          console.log(
            "CIVILI: Harmful evidence received:",
            evidence
          );

          // =================================================
          // PREVENT DUPLICATE OPENING
          // =================================================

          const alreadyProcessed =
            sessionStorage.getItem(
              `civili-${evidence.id}`
            );

          if (alreadyProcessed) {

            return;

          }

          sessionStorage.setItem(
            `civili-${evidence.id}`,
            "true"
          );

          // =================================================
          // SOURCE
          // =================================================

          setSource(
            evidence.source ||
            "WhatsApp"
          );

          // =================================================
          // METHOD
          // =================================================

          setMethod(
            "notification"
          );

          // =================================================
          // APPLY AI RESULT
          // =================================================

          applyEvidenceResult(
            evidence,
            evidence.content ||
            "Content unavailable"
          );

          // =================================================
          // OPEN ANALYSIS
          // =================================================

          setShowCapture(
            false
          );

          setShowAnalysis(
            true
          );

        } catch (error) {

          // Python bridge may simply not be running yet.
          // Don't spam the console every 2 seconds.

          console.log(
            "CIVILI: Waiting for notification bridge..."
          );

        }

      };

    checkForEvidence();

    const interval =
      setInterval(
        checkForEvidence,
        2000
      );

    return () => {

      clearInterval(
        interval
      );

    };

  }, []);

  // =========================================================
  // SCREENSHOT OCR
  // =========================================================

  const handleFileChange =
    async (event) => {

      const file =
        event.target.files[0];

      if (!file) {

        return;

      }

      setSelectedFile(
        file
      );

      setOcrText("");

      setRiskLevel(
        "ANALYZING..."
      );

      setDetectedIntent(
        "ANALYZING..."
      );

      setConfidence(0);

      setNotificationScores({});

      setAnalysisStatus(
        "OCR INITIALIZING"
      );

      setOcrProgress(0);

      console.log(
        "CIVILI: Starting screenshot analysis..."
      );

      try {

        // =================================================
        // SHA-256
        // =================================================

        const buffer =
          await file.arrayBuffer();

        const hashBuffer =
          await crypto.subtle.digest(
            "SHA-256",
            buffer
          );

        const hashArray =
          Array.from(
            new Uint8Array(
              hashBuffer
            )
          );

        const hashHex =
          hashArray
            .map(
              (byte) =>
                byte
                  .toString(16)
                  .padStart(2, "0")
            )
            .join("");

        setFileHash(
          hashHex
        );

        console.log(
          "CIVILI: SHA-256 computed:",
          hashHex
        );

        // =================================================
        // OCR
        // =================================================

        setAnalysisStatus(
          "OCR PROCESSING"
        );

        console.log(
          "CIVILI: Creating Tesseract worker..."
        );

        const worker =
          await createWorker(
            "eng",
            1,
            {

              logger:
                (message) => {

                  if (
                    message.status ===
                    "recognizing text"
                  ) {

                    setOcrProgress(
                      Math.round(
                        message.progress *
                        100
                      )
                    );

                  }

                }

            }
          );

        console.log(
          "CIVILI: Tesseract worker ready."
        );

        const result =
          await worker.recognize(
            file
          );

        const extractedText =
          result.data.text.trim();

        await worker.terminate();

        setOcrProgress(
          100
        );

        // =================================================
        // OCR RESULT
        // =================================================

        if (!extractedText) {

          setOcrText(
            "No text detected in screenshot."
          );

          setAnalysisStatus(
            "OCR COMPLETE"
          );

          setRiskLevel(
            "NOT ASSESSED"
          );

          setDetectedIntent(
            "No text detected"
          );

          setConfidence(0);

          return;

        }

        setOcrText(
          extractedText
        );

        console.log(
          "CIVILI: OCR extracted:",
          extractedText
        );

        // =================================================
        // IMPORTANT:
        // OCR → PYTHON DETOXIFY
        // =================================================

        setAnalysisStatus(
          "OCR COMPLETE"
        );

        console.log(
          "CIVILI: Sending OCR text to Detoxify..."
        );

        const success =
          await analyzeWithCiviliAI(

            extractedText,

            source ||
            "Screenshot",

            "Screenshot Upload"

          );

        if (success) {

          console.log(
            "CIVILI: Screenshot → OCR → AI complete."
          );

        }

      } catch (error) {

        console.error(
          "CIVILI screenshot analysis failed:",
          error
        );

        setAnalysisStatus(
          "ANALYSIS FAILED"
        );

        setOcrText("");

        setRiskLevel(
          "UNAVAILABLE"
        );

        setDetectedIntent(
          "UNAVAILABLE"
        );

        setConfidence(0);

      }

    };

  // =========================================================
  // MANUAL ENTRY → AI ANALYSIS
  // =========================================================

  const handleManualAnalysis =
    async () => {

      const text =
        manualText.trim();

      if (!text) {

        alert(
          "Please enter the message/content to analyze."
        );

        return;

      }

      setManualAnalyzing(
        true
      );

      // =====================================================
      // SEND TO SAME AI ENGINE
      // =====================================================

      const success =
        await analyzeWithCiviliAI(

          text,

          source ||
          "Manual Entry",

          "Manual Entry"

        );

      if (success) {

        // Keep the sender available for the
        // Evidence Analysis screen.

        setShowCapture(
          false
        );

        setShowAnalysis(
          true
        );

      }

      setManualAnalyzing(
        false
      );

      setSelectedAudio(null);
      setVoiceAnalyzing(false);
      setVoiceTranscript("");
      setVoiceLanguage("");
      setVoiceError("");

    };

  // =========================================================
  // CONTINUE FROM CAPTURE SCREEN
  // =========================================================

  const handleContinue =
    () => {

      // =====================================================
      // SOURCE
      // =====================================================

      if (!source) {

        alert(
          "Please select an evidence source."
        );

        return;

      }

      // =====================================================
      // METHOD
      // =====================================================

      if (!method) {

        alert(
          "Please select a capture method."
        );

        return;

      }

      // =====================================================
      // SCREENSHOT
      // =====================================================

      if (
        method === "screenshot"
      ) {

        if (!selectedFile) {

          alert(
            "Please upload a screenshot."
          );

          return;

        }

        // OCR + AI should already be complete
        // because file selection automatically
        // triggers both.

        if (
          !ocrText ||
          analysisStatus ===
          "ANALYSIS FAILED"
        ) {

          alert(
            "Please wait for OCR and AI analysis to finish."
          );

          return;

        }

        setShowCapture(
          false
        );

        setShowAnalysis(
          true
        );

        return;

      }

      // =====================================================
      // NOTIFICATION
      // =====================================================

      if (
        method === "notification"
      ) {

        if (!ocrText) {

          alert(
            "No notification evidence is available yet."
          );

          return;

        }

        setShowCapture(
          false
        );

        setShowAnalysis(
          true
        );

        return;

      }

      // =====================================================
      // VOICE
      // =====================================================
      if (method === "voice") {
        if (!selectedAudio) { alert("Please upload an audio file."); return; }
        if (!voiceTranscript || voiceAnalyzing) { alert("Please wait for voice transcription and AI analysis to finish."); return; }
        setShowCapture(false);
        setShowAnalysis(true);
        return;
      }

      // =====================================================
      // MANUAL
      // =====================================================
      // Manual uses its own AI button above.
      // This block is only a safety fallback.

      if (
        method === "manual"
      ) {

        if (!manualText.trim()) {

          alert(
            "Please enter the evidence message."
          );

          return;

        }

        return;

      }

    };

  // =========================================================
  // PRESERVE EVIDENCE → LOCAL INDEXEDDB
  // =========================================================

  const preserveEvidence = async () => {
    try {
      if (!evidenceId) {
        alert("No evidence available to preserve.");
        return;
      }

      if (!ocrText && !selectedFile && !selectedAudio) {
        alert("No evidence content available.");
        return;
      }

      let finalHash = fileHash;

      // Text-only evidence gets its own SHA-256 hash at preservation time.
      if (!finalHash) {
        finalHash = await computeSHA256(ocrText || "");
        setFileHash(finalHash);
      }

      const timestampISO = new Date().toISOString();

      const evidenceRecord = {
        id: evidenceId,
        source: source || "WhatsApp",
        captureMethod:
          method === "notification"
            ? "Automatic Notification"
            : method === "screenshot"
            ? "Screenshot Upload"
            : method === "voice"
            ? "Manual Voice Upload"
            : "Manual Entry",
        content: ocrText || "",
        risk: riskLevel || "NOT ASSESSED",
        intent: detectedIntent || "NOT ASSESSED",
        confidence: Number(confidence) || 0,
        scores: notificationScores || {},
        timestamp: timestampISO,
        preservedAt: timestampISO,
        sha256: finalHash,
        fileName: selectedFile?.name || selectedAudio?.name || null,
        fileType: selectedFile?.type || selectedAudio?.type || null,
        fileSize: selectedFile?.size || selectedAudio?.size || null,
        file: selectedFile || selectedAudio || null,
        language: method === "voice" ? voiceLanguage : null,
        integrityStatus: "VERIFIED AT CAPTURE"
      };

      await saveEvidenceToDB(evidenceRecord);

      setEvidenceDatabase((previous) => [
        evidenceRecord,
        ...previous.filter((item) => item.id !== evidenceRecord.id)
      ]);

      alert(
        `🔐 Evidence ${evidenceId} preserved successfully.\n\n` +
        `Risk: ${riskLevel}\n` +
        `SHA-256: ${finalHash.substring(0, 24)}...\n\n` +
        `Stored in CIVILI Local Evidence Vault.`
      );
    } catch (error) {
      console.error(
        "CIVILI: Evidence preservation failed:",
        error
      );
      alert(
        "CIVILI could not preserve this evidence locally.\n\n" +
        (error?.message || "Unknown database error.")
      );
    }
  };

  // =========================================================
  // RESET
  // =========================================================

  const resetCapture =
    () => {

      setSource("");

      setMethod("");

      setSelectedFile(
        null
      );

      setFileHash("");

      setCapturedAt("");

      setEvidenceId("");

      setOcrText("");

      setManualText("");

      setManualSender("");

      setManualAnalyzing(
        false
      );

      setAnalysisStatus(
        "NOT STARTED"
      );

      setRiskLevel(
        "NOT ASSESSED"
      );

      setDetectedIntent(
        "NOT ASSESSED"
      );

      setConfidence(
        0
      );

      setNotificationScores(
        {}
      );

      setOcrProgress(
        0
      );

      setShowCapture(
        false
      );

      setShowAnalysis(
        false
      );

    };

  // =========================================================
  // RENDER
  // =========================================================

  return (

    <div className="app">

      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="topbar">

        <div>

          <h1>
            CIVILI
          </h1>

          <p>
            Evidence Collection &
            Preservation
          </p>

        </div>

        <div className="status">

          <span className="status-dot"></span>

          SYSTEM ACTIVE

        </div>

      </header>

      {/* ===================================================
          DASHBOARD
      =================================================== */}

      <main className="dashboard">

        <div className="welcome">

          <div>

            <h2>
              Evidence Dashboard
            </h2>

            <p>
              Preserve, analyze and
              organize digital evidence
              from cyberbullying incidents.
            </p>

          </div>

          <button
            className="capture-button"
            onClick={() =>
              setShowCapture(
                true
              )
            }
          >

            + Capture New Evidence

          </button>

        </div>

        {/* =================================================
            STATS
        ================================================= */}

        <section className="stats">

          <div className="stat-card">

            <span>
              Total Evidence
            </span>

            <strong>
              {evidenceDatabase.length}
            </strong>

          </div>

          <div className="stat-card">

            <span>
              AI Analyzed
            </span>

            <strong>
              {evidenceDatabase.filter(
                (item) => item.intent && item.intent !== "NOT ASSESSED"
              ).length}
            </strong>

          </div>

          <div className="stat-card danger">

            <span>
              High Risk
            </span>

            <strong>
              {evidenceDatabase.filter(
                (item) => String(item.risk || "").toUpperCase() === "HIGH"
              ).length}
            </strong>

          </div>

        </section>

        {/* =================================================
            RECENT EVIDENCE
        ================================================= */}

        <section className="evidence-section">

          <div className="section-header">

            <h3>
              Recent Evidence
            </h3>

            <button>
              View All
            </button>

          </div>

          <div className="evidence-list">

            {databaseLoading ? (
              <div className="evidence-item">
                <div className="evidence-info">
                  <strong>Loading local evidence...</strong>
                  <span>CIVILI Evidence Vault</span>
                </div>
              </div>
            ) : evidenceDatabase.length === 0 ? (
              <div className="evidence-item">
                <div className="evidence-info">
                  <strong>No preserved evidence yet</strong>
                  <span>Captured evidence will appear here.</span>
                </div>
              </div>
            ) : (
              evidenceDatabase.slice(0, 5).map((item) => {
                const normalizedRisk = String(
                  item.risk || "NOT ASSESSED"
                ).toUpperCase();

                const severityClass =
                  normalizedRisk === "HIGH"
                    ? "high"
                    : normalizedRisk === "MEDIUM"
                    ? "medium"
                    : "low";

                return (
                  <div className="evidence-item" key={item.id}>
                    <div className={`severity ${severityClass}`}></div>

                    <div className="evidence-info">
                      <strong>
                        {item.intent && item.intent !== "NOT ASSESSED"
                          ? item.intent
                          : "Digital Evidence"}
                      </strong>

                      <span>
                        {item.source || "Unknown"} • {" "}
                        {item.timestamp
                          ? new Date(item.timestamp).toLocaleString()
                          : "Time unavailable"}
                      </span>
                    </div>

                    <div
                      className={`evidence-label ${severityClass}-text`}
                    >
                      {normalizedRisk === "HIGH"
                        ? "HIGH RISK"
                        : normalizedRisk}
                    </div>
                    <button
                        className="view-evidence-button"
                        onClick={() => {
                          setSource(item.source || "Unknown");
                          setOcrText(item.content || "No content available");
                          setRiskLevel(item.risk || "NOT ASSESSED");
                          setDetectedIntent(item.intent || "NOT ASSESSED");
                          setConfidence(Number(item.confidence) || 0);
                          setNotificationScores(item.scores || {});
                          setEvidenceId(item.id || "");
                          setFileHash(item.sha256 || "");

                          setCapturedAt(
                          item.timestamp
                          ? new Date(item.timestamp).toLocaleString()
                          : ""
                          );

                          setShowAnalysis(true);
                        }}
                        >
                        View
                    </button>
                  </div>
                );
              })
            )}

          </div>

        </section>

      </main>

      {/* ===================================================
          CAPTURE MODAL
      =================================================== */}

      {showCapture && (

        <div className="modal-overlay">

          <div className="capture-modal">

            <div className="modal-header">

              <div>

                <h2>
                  Capture New Evidence
                </h2>

                <p>
                  Collect and preserve
                  digital evidence securely.
                </p>

              </div>

              <button
                className="close-button"
                onClick={
                  resetCapture
                }
              >

                ×

              </button>

            </div>

            <div className="capture-content">

              {/* =================================================
                  SOURCE
              ================================================= */}

              <div className="capture-step">

                <span className="step-number">
                  1
                </span>

                <div className="step-content">

                  <h3>
                    Evidence Source
                  </h3>

                  <p>
                    Select where the
                    evidence originated.
                  </p>

                  <div className="source-options">

                    <button
                      className={`source-option ${
                        source ===
                        "WhatsApp"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setSource(
                          "WhatsApp"
                        )
                      }
                    >

                      <span>
                        💬
                      </span>

                      WhatsApp

                    </button>

                    <button
                      className={`source-option ${
                        source ===
                        "Instagram"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setSource(
                          "Instagram"
                        )
                      }
                    >

                      <span>
                        📷
                      </span>

                      Instagram

                    </button>

                    <button
                      className={`source-option ${
                        source ===
                        "Telegram"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setSource(
                          "Telegram"
                        )
                      }
                    >

                      <span>
                        ✈️
                      </span>

                      Telegram

                    </button>

                    <button
                      className={`source-option ${
                        source ===
                        "Other"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setSource(
                          "Other"
                        )
                      }
                    >

                      <span>
                        🌐
                      </span>

                      Other

                    </button>

                  </div>

                </div>

              </div>

              {/* =================================================
                  METHOD
              ================================================= */}

              <div className="capture-step">

                <span className="step-number">
                  2
                </span>

                <div className="step-content">

                  <h3>
                    Capture Method
                  </h3>

                  <p>
                    Choose how the
                    evidence will
                    be collected.
                  </p>

                  <div className="method-options">

                    {/* SCREENSHOT */}

                    <label
                      className={`method-option ${
                        method ===
                        "screenshot"
                          ? "selected"
                          : ""
                      }`}
                    >

                      <input
                        type="radio"
                        name="method"
                        checked={
                          method ===
                          "screenshot"
                        }
                        onChange={() =>
                          setMethod(
                            "screenshot"
                          )
                        }
                      />

                      <div>

                        <strong>
                          📸 Upload Screenshot
                        </strong>

                        <span>
                          Preserve a screenshot
                          as evidence
                        </span>

                      </div>

                    </label>

                    {/* NOTIFICATION */}

                    <button
                      className={`method-option ${
                        method ===
                        "notification"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setMethod(
                          "notification"
                        )
                      }
                    >

                      <strong>
                        🔔 Notification Evidence
                      </strong>

                      <span>
                        Automatically capture
                        harmful notifications
                      </span>

                    </button>

                    {/* MANUAL */}

                    <button
                      className={`method-option ${
                        method ===
                        "manual"
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setMethod(
                          "manual"
                        )
                      }
                    >

                      <strong>
                        ✍️ Manual Entry
                      </strong>

                      <span>
                        Enter evidence details
                        manually
                      </span>

                    </button>

                    <button
                      className={`method-option ${method === "voice" ? "selected" : ""}`}
                      onClick={() => setMethod("voice")}
                    >
                      <strong>🎙️ Voice Evidence</strong>
                      <span>Upload an audio recording for AI analysis</span>
                    </button>

                  </div>

                  {/* =================================================
                      SCREENSHOT UPLOAD
                  ================================================= */}

                  {method ===
                    "screenshot" && (

                    <div className="upload-area">

                      <input
                        type="file"
                        accept="image/*"
                        id="evidence-file"
                        onChange={
                          handleFileChange
                        }
                      />

                      <label
                        htmlFor="evidence-file"
                      >

                        📁 Choose Screenshot

                      </label>

                      {selectedFile && (

                        <div className="file-selected">

                          ✓{" "}
                          {selectedFile.name}

                        </div>

                      )}

                      {ocrProgress >
                        0 &&
                        ocrProgress <
                        100 && (

                        <div>

                          OCR Progress:{" "}
                          {ocrProgress}%

                        </div>

                      )}

                      {analysisStatus ===
                        "AI ANALYSIS IN PROGRESS" && (

                        <div>

                          🤖 CIVILI AI analyzing...

                        </div>

                      )}

                      {analysisStatus ===
                        "AI ANALYSIS COMPLETE" && (

                        <div>

                          ✓ OCR + AI analysis complete

                        </div>

                      )}

                    </div>

                  )}

                  {/* =================================================
                      VOICE EVIDENCE
                  ================================================= */}
                  {method === "voice" && (
                    <div className="upload-area">
                      <input
                        type="file"
                        accept="audio/*"
                        id="voice-evidence-file"
                        onChange={handleVoiceFileChange}
                      />
                      <label htmlFor="voice-evidence-file">
                        🎙️ Choose Audio File
                      </label>
                      {selectedAudio && (
                        <div className="file-selected">
                          ✓ {selectedAudio.name}
                        </div>
                      )}
                      {voiceAnalyzing && (
                        <div>
                          🎙️ Converting speech to text...<br />
                          🤖 CIVILI AI analyzing transcript...
                        </div>
                      )}
                      {voiceLanguage && !voiceAnalyzing && (
                        <div>Detected Language: <strong>{voiceLanguage}</strong></div>
                      )}
                      {voiceTranscript && (
                        <div className="detected-content">
                          <span>Voice Transcript</span>
                          <p>{voiceTranscript}</p>
                        </div>
                      )}
                      {voiceError && <div>❌ {voiceError}</div>}
                    </div>
                  )}

                  {/* =================================================
                      MANUAL ENTRY
                  ================================================= */}

                  {method ===
                    "manual" && (

                    <div className="manual-entry-area">

                      <div className="manual-field">

                        <label>
                          Sender / Username
                        </label>

                        <input
                          type="text"
                          value={
                            manualSender
                          }
                          onChange={(
                            event
                          ) =>
                            setManualSender(
                              event.target.value
                            )
                          }
                          placeholder="e.g. Unknown User"
                        />

                      </div>

                      <div className="manual-field">

                        <label>
                          Message / Evidence Content
                        </label>

                        <textarea
                          value={
                            manualText
                          }
                          onChange={(
                            event
                          ) =>
                            setManualText(
                              event.target.value
                            )
                          }
                          placeholder="Enter the message or harmful content here..."
                          rows="6"
                        />

                      </div>

                      <div className="manual-info">

                        🤖 This content will be
                        analyzed by CIVILI's
                        local Detoxify NLP engine.

                      </div>

                      <button
                        className="continue-button"
                        onClick={
                          handleManualAnalysis
                        }
                        disabled={
                          manualAnalyzing
                        }
                      >

                        {manualAnalyzing
                          ? "🤖 Analyzing..."
                          : "🤖 Analyze with CIVILI AI"}

                      </button>

                    </div>

                  )}

                </div>

              </div>

              {/* =================================================
                  ACTIONS
              ================================================= */}

              <div className="capture-actions">

                <button
                  className="cancel-button"
                  onClick={
                    resetCapture
                  }
                >

                  Cancel

                </button>

                {method !==
                  "manual" && (

                  <button
                    className="continue-button"
                    onClick={
                      handleContinue
                    }
                  >

                    Continue →

                  </button>

                )}

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ===================================================
          ANALYSIS SCREEN
      =================================================== */}

      {showAnalysis && (

        <div className="modal-overlay">

          <div className="capture-modal">

            <div className="modal-header">

              <div>

                <h2>
                  Evidence Analysis
                </h2>

                <p>
                  Evidence acquisition,
                  AI analysis and
                  integrity information.
                </p>

              </div>

              <button
                className="close-button"
                onClick={
                  resetCapture
                }
              >

                ×

              </button>

            </div>

            <div className="capture-content">

              {/* =================================================
                  CAPTURE SUMMARY
              ================================================= */}

              <div className="analysis-card">

                <div className="analysis-icon">
                  📄
                </div>

                <div>

                  <strong>
                    Evidence Captured
                  </strong>

                  <p>
                    Source: {source}
                  </p>

                  <p>
                    Method:{" "}

                    {method ===
                    "screenshot"
                      ? "Screenshot Upload"
                      : method ===
                        "notification"
                      ? "Automatic Notification"
                      : "Manual Entry"}

                  </p>

                  {manualSender && (
                    <p>
                      Sender:{" "}
                      {manualSender}
                    </p>
                  )}

                  {selectedFile && (

                    <>

                      <p>
                        File:{" "}
                        {selectedFile.name}
                      </p>

                      <p>
                        Type:{" "}
                        {selectedFile.type ||
                          "Unknown"}
                      </p>

                      <p>
                        Size:{" "}
                        {(
                          selectedFile.size /
                          1024
                        ).toFixed(2)}{" "}
                        KB
                      </p>

                    </>

                  )}

                </div>

              </div>

              {/* =================================================
                  IMAGE PREVIEW
              ================================================= */}

              {selectedFile && (

                <div className="preview-card">

                  <h3>
                    Evidence Preview
                  </h3>

                  <img
                    src={
                      URL.createObjectURL(
                        selectedFile
                      )
                    }
                    alt="Uploaded evidence"
                    className="evidence-preview"
                  />

                </div>

              )}

              {/* =================================================
                  CAPTURED CONTENT
              ================================================= */}

              {ocrText && (

                <div className="detected-content">

                  <span>
                    Captured Content
                  </span>

                  <p>
                    {ocrText}
                  </p>

                </div>

              )}

              {/* =================================================
                  AI ANALYSIS
              ================================================= */}

              <div
  className={`ai-analysis ${
    riskLevel === "HIGH"
      ? "risk-high"
      : riskLevel === "MEDIUM"
      ? "risk-medium"
      : riskLevel === "LOW" || riskLevel === "SAFE"
      ? "risk-safe"
      : "risk-neutral"
  }`}
>

                <div className="ai-header">

                  <span>
                    🤖
                  </span>

                  <strong>
                    AI Intent Analysis
                  </strong>

                </div>

                <div className="analysis-result">

                  {/* STATUS */}

                  <div>

                    <span>
                      Analysis Status
                    </span>

                    <strong>
                      {analysisStatus}
                    </strong>

                  </div>

                  {/* RISK */}

                  <div>

                    <span>
                      Risk Classification
                    </span>

                    <strong
                      className={
                      riskLevel === "HIGH"
                      ? "risk-badge high"
                      : riskLevel === "MEDIUM"
                      ? "risk-badge medium"
                      : riskLevel === "LOW" ||
                       riskLevel === "SAFE"
                     ? "risk-badge safe"
                     : "neutral-text"
                      }
                      >
                       {riskLevel === "LOW" ? "SAFE" : riskLevel}
                    </strong>

                  </div>

                  {/* INTENT */}

                  <div>

                    <span>
                      Detected Intent
                    </span>

                    <strong>
                      {detectedIntent}
                    </strong>

                  </div>

                  {/* CONFIDENCE */}

                  <div>

                    <span>
                      AI Confidence
                    </span>

                    <strong>

                      {confidence >
                      0
                        ? `${confidence}%`
                        : "N/A"}

                    </strong>

                  </div>

                </div>

                {/* =================================================
                    DETOXIFY SCORES
                ================================================= */}

                {Object.keys(
                  notificationScores
                ).length > 0 && (

                  <div
                    className="analysis-note"
                  >

                    <strong>
                      NLP Detection Scores
                    </strong>

                    <br />

                    Toxicity:{" "}

                    {Math.round(
                      (
                        notificationScores
                          .toxicity ||
                        0
                      )
                    )}%

                    {" • "}

                    Threat:{" "}

                    {Math.round(
                      (
                        notificationScores
                          .threat ||
                        0
                      )
                    )}%

                    {" • "}

                    Insult:{" "}

                    {Math.round(
                      (
                        notificationScores
                          .insult ||
                        0
                      )
                    )}%

                    {" • "}

                    Obscene:{" "}

                    {Math.round(
                      (
                        notificationScores
                          .obscene ||
                        0
                      )
                    )}%

                  </div>

                )}

              </div>

              {/* =================================================
                  METADATA
              ================================================= */}

              <div className="metadata-card">

                <h3>
                  Evidence Metadata
                </h3>

                <div className="metadata-grid">

                  {/* EVIDENCE ID */}

                  <div>

                    <span>
                      Evidence ID
                    </span>

                    <strong>
                      {evidenceId}
                    </strong>

                  </div>

                  {/* SOURCE */}

                  <div>

                    <span>
                      Source
                    </span>

                    <strong>
                      {source}
                    </strong>

                  </div>

                  {/* CAPTURE METHOD */}

                  <div>

                    <span>
                      Capture Method
                    </span>

                    <strong>

                      {method ===
                      "notification"
                        ? "Automatic Notification"
                        : method ===
                          "screenshot"
                        ? "Screenshot Upload"
                        : "Manual Entry"}

                    </strong>

                  </div>

                  {/* FILE TYPE */}

                  <div>

                    <span>
                      File Type
                    </span>

                    <strong>

                      {selectedFile?.type ||
                        "N/A"}

                    </strong>

                  </div>

                  {/* FILE SIZE */}

                  <div>

                    <span>
                      File Size
                    </span>

                    <strong>

                      {selectedFile
                        ? `${(
                            selectedFile.size /
                            1024
                          ).toFixed(
                            2
                          )} KB`
                        : "N/A"}

                    </strong>

                  </div>

                  {/* SHA-256 */}

                  <div>

                    <span>
                      SHA-256 Integrity Hash
                    </span>

                    <strong
                      className="hash-value"
                    >

                      {fileHash ||
                        "Text evidence — content captured"}

                    </strong>

                  </div>

                  {/* TIMESTAMP */}

                  <div>

                    <span>
                      Acquisition Timestamp
                    </span>

                    <strong>
                      {capturedAt}
                    </strong>

                  </div>

                  {/* NETWORK */}

                  <div>

                    <span>
                      Network / Packet Data
                    </span>

                    <strong
                      className="neutral-text"
                    >

                      NOT AVAILABLE

                    </strong>

                  </div>

                  {/* INTEGRITY */}

                  <div>

                    <span>
                      Integrity Status
                    </span>

                    <strong
                      className="low-text"
                    >

                      {fileHash
                        ? "✓ HASH COMPUTED"
                        : "✓ CONTENT CAPTURED"}

                    </strong>

                  </div>

                </div>

              </div>

              {/* =================================================
                  PRESERVE
              ================================================= */}

              <button
                className="preserve-button"
                onClick={preserveEvidence}
              >

                🔐 Preserve Evidence

              </button>

              <button
                className="cancel-button"
                onClick={
                  resetCapture
                }
              >

                ← Capture Another Evidence

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

export default App

