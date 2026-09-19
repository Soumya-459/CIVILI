# CIVILI

### On-Device AI Digital Safety & Cryptographic Evidence Preservation

CIVILI is a digital-safety system designed to help organizations and digital platforms **detect harmful interactions, intervene before escalation, and preserve relevant digital evidence when an incident occurs**.

The project is designed for tertiary-sector environments including **Hospitality, Retail, Financial Services, and Entertainment**, where employees, creators, customers, and digital participants may encounter abusive or harmful digital interactions.

---

## Core Concept

**DETECT → INTERVENE → PRESERVE**

* **Detect** — Analyze digital interactions using AI-based text and multimodal analysis.
* **Intervene** — Provide a real-time warning and allow the user to edit, cancel, or proceed.
* **Preserve** — When a harmful interaction requires preservation, capture relevant evidence with timestamp, metadata, and SHA-256 integrity verification.

---

## Current Prototype

This repository contains the **CIVILI Evidence prototype**, which demonstrates the core AI and evidence-preservation pipeline.

### Prototype capabilities

* Harmful-content detection
* Context-aware risk assessment
* Real-time intervention workflow
* Notification-based interaction analysis
* Speech-to-text processing using Whisper
* OCR-based text extraction
* Event-driven evidence capture
* Evidence metadata generation
* Timestamped incident records
* SHA-256 integrity hashing
* Local evidence storage / Evidence Vault

> The current prototype demonstrates the core AI and evidence pipeline. OS-level and enterprise/platform integrations are part of the proposed production deployment architecture and are not claimed as fully implemented in this prototype.

---

## Architecture

```text
Digital Interaction
        │
        ▼
Multimodal / Notification Intake
        │
        ▼
AI-Based Analysis
        │
        ├── Text
        ├── Image / OCR
        └── Audio / Speech-to-Text
        │
        ▼
Context & Risk Assessment
        │
        ▼
CIVILI Policy Decision
        │
   ┌────┴─────┐
   │          │
 Safe       Harmful
   │          │
Proceed    Warn User
              │
        ┌─────┼─────┐
        │     │     │
       Edit Cancel Proceed
        │           │
        ▼           ▼
   Re-analyse   Send + Preserve
                    │
                    ▼
             Evidence Vault
                    │
          Timestamp + Metadata
                    │
                 SHA-256
```

---

## Technology Stack

### AI / Machine Learning

* Python
* PyTorch
* NLP
* Computer Vision
* Detoxify / Toxic-BERT
* Whisper / Speech-to-Text
* Tesseract OCR

### Application

* React
* Vite
* Flask

### Security & Evidence

* SHA-256 integrity hashing
* Local evidence storage
* Event-driven evidence preservation

### Proposed Production Integration

* OS-authorized interfaces
* Enterprise SDK / API integration
* OEM / platform integration where authorized

---

## Project Structure

```text
CIVILI/
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── package-lock.json
│
├── notification_bridge.py
├── notification_test.py
├── package.json
└── package-lock.json
```

---

## Running the Prototype

### 1. Enter the frontend directory

```bash
cd frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

The frontend will then be available through the local development URL shown in the terminal.

---

## CIVILI Deployment Vision

CIVILI is designed around authorized integration rather than universal interception of third-party applications.

### OS-Integrated Deployment

Integration through OS-authorized interfaces and, where required, OEM/system-level deployment.

### Enterprise / Platform Integration

Authorized SDK/API integration with participating organizations or platforms.

The production architecture therefore follows:

**OS-INTEGRATED BY DESIGN → ENTERPRISE-INTEGRABLE BY DEPLOYMENT**

---

## Privacy & Security Principles

CIVILI follows a privacy-oriented design approach:

* Process data locally where practical
* Preserve evidence only when an incident triggers preservation
* Minimize unnecessary data collection
* Provide user-controlled actions
* Use cryptographic hashing to verify evidence integrity
* Support secure local evidence storage

These principles are design goals; regulatory compliance and production security require formal assessment and validation during deployment.

---

## Future Development

The current repository focuses on the CIVILI Evidence prototype.

Future development includes:

* CIVILI Shield for outgoing harmful-content prevention
* Expanded multimodal analysis
* Multilingual and regional-language support
* Sector-specific policy models
* Enterprise policy management
* Incident-review dashboards
* Authorized platform integrations
* OEM/system-level deployment

---

## Project Vision

**CIVILI aims to move digital safety from reactive reporting toward proactive detection, user-controlled intervention, and reliable evidence preservation.**

**Detect. Intervene. Preserve.**
