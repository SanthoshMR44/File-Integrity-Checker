# File Integrity Checker Using SHA-256

A simple, reliable single-page React application that demonstrates cryptographic file integrity checking using the **SHA-256** hashing algorithm.

---

## 1. Project Title

**File Integrity Checker Using SHA-256**  
*(Cryptography and Network Security Mini-Project)*

---

## 2. Introduction

This project checks whether a file has been modified by comparing its **SHA-256** cryptographic hash with a previously stored baseline hash.

In cybersecurity, a cryptographic hash function acts as a unique digital fingerprint of a file. If even a single character or byte within the file is changed, the resulting SHA-256 hash changes completely (known as the **Avalanche Effect**). By calculating and comparing these hashes, users can instantly determine if a file is authentic or if it has been tampered with.

---

## 3. Objective

The objective of this mini-project is to:
* Demonstrate the concept of **cryptographic hashing** and **integrity verification**.
* Use the **SHA-256** algorithm to compute a fixed 64-character hexadecimal checksum of any file.
* Detect unauthorized file modifications by comparing a file's current hash against a saved baseline.
* Provide an easy-to-understand, frontend-only demonstration suitable for college laboratory exams and technical vivas.

---

## 4. Technologies Used

* **React** — Component-based user interface
* **JavaScript (ES6+)** — Application logic and file handling
* **HTML5** — Web page structure
* **CSS3** — Custom modern styling and responsive dark theme
* **Web Crypto API** (`crypto.subtle.digest`) — Browser-native SHA-256 computation
* **LocalStorage** — Persistent baseline storage between page refreshes
* **Vite** — Fast frontend development server and build tool
* **Lucide React** — Lightweight UI icons

*(No backend servers, databases, authentication, or external API dependencies are required.)*

---

## 5. How It Works

The workflow of file integrity verification operates in three simple stages:

### Step A: Baseline Creation
```text
Original File  ──►  SHA-256 Algorithm  ──►  Original Hash (64 hex characters)
                                                    │
                                           [ Saved to LocalStorage ]
```

### Step B: Verification
```text
Target File    ──►  SHA-256 Algorithm  ──►  Current Hash (64 hex characters)
```

### Step C: Comparison Decision
```text
If Original Hash == Current Hash:
  └──► ✓ INTEGRITY VERIFIED (The file has NOT been modified)

If Original Hash != Current Hash:
  └──► ✗ INTEGRITY FAILED   (The file HAS been modified or is different)
```

---

## 6. Features

* **Client-Side SHA-256 Calculation:** Computes the full 64-character hexadecimal hash directly inside the browser using standard Web Crypto API.
* **File Details Display:** Shows file name, file size (Bytes/KB/MB), MIME type, and last-modified date.
* **Baseline Management:** Save original file hash to `localStorage` with a timestamp and reset/clear baseline with one click.
* **Instant Visual Integrity Result:**
  * **Green Banner (✓ INTEGRITY VERIFIED):** Displayed when hashes match.
  * **Red Banner (✗ INTEGRITY FAILED):** Displayed when a mismatch occurs.
* **Side-by-Side Hash Comparison:** Displays original and current hashes for immediate visual verification.
* **Avalanche Effect Explanation:** Highlights how altering even 1 byte causes a completely different hash output.
* **One-Click Copy:** Copy any calculated hash to clipboard.
* **Built-in Viva Demo Generator:** Built-in tool to generate and download sample test files (`demo_original.txt` and `demo_modified.txt`) for live demonstrations.

---

## 7. How to Run

### Prerequisites
* **Node.js** (v18.0.0 or higher)
* **npm** (installed with Node.js)

### Commands

1. **Install dependencies:**
   ```bash
   npm run install:client
   ```

2. **Start the application:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   Open [http://localhost:5173](http://localhost:5173) in any modern web browser (Chrome, Edge, Firefox, Safari).

---

## 8. Project Demonstration

Follow these steps for a viva or lab presentation:

1. **Select Original File:**
   * In **Step 1**, click **Select File** or drag-and-drop a file (e.g. `demo_original.txt`).
   * The app reads the file and computes its 64-character SHA-256 hash.

2. **Save as Baseline:**
   * Click **Save as Original / Create Baseline**.
   * The baseline is stored in `localStorage` and displayed under **Step 2**.

3. **Verify the Same File (Success Test):**
   * In **Step 3 (Verify File Integrity)**, select the same file.
   * The app computes its hash, compares it with the baseline, and displays:  
     **✓ INTEGRITY VERIFIED — The file has not been modified.**

4. **Modify the File (Tamper Test):**
   * Open the file in a text editor (e.g., Notepad), add or change a single character, and save it.
   * In **Step 3**, select the modified file.
   * The newly computed hash will not match the baseline, and the app displays:  
     **✗ INTEGRITY FAILED — The file has been modified or is different from the original file.**

5. **Clear Baseline:**
   * Click **Clear Baseline** to reset the stored baseline.

---

## 9. Limitations

* **Educational Scope:** This project is designed as an educational mini-project demonstrating cryptography principles.
* **LocalStorage Storage:** Baseline records are stored in browser `localStorage` and are specific to the current browser.
* **Client-Side Processing:** File hashing runs entirely within the browser's JavaScript engine sandbox without server-side validation.
