import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  FileX2,
  FileText,
  Copy,
  Check,
  Trash2,
  Save,
  RotateCcw,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  KeyRound,
  AlertTriangle
} from 'lucide-react';

// ─── Utility: Format File Size ─────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ─── Utility: Format Date ──────────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

// ─── Core Function: Calculate SHA-256 Hash using Web Crypto API ───────────
export async function calculateSHA256(file) {
  if (!file) {
    throw new Error('No file provided for hash calculation.');
  }
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  // Calculate SHA-256 digest using standard Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  // Convert ArrayBuffer to 64-character hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.toLowerCase();
}

const STORAGE_KEY = 'file_integrity_baseline_v1';

export default function App() {
  // Step 1 State: Original File
  const [originalFile, setOriginalFile] = useState(null);
  const [originalMeta, setOriginalMeta] = useState(null);
  const [originalHash, setOriginalHash] = useState('');
  const [isHashingOriginal, setIsHashingOriginal] = useState(false);
  const [originalError, setOriginalError] = useState('');
  const originalInputRef = useRef(null);

  // Step 2 State: Baseline in LocalStorage
  const [baseline, setBaseline] = useState(null);

  // Step 3 State: Verification File
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyMeta, setVerifyMeta] = useState(null);
  const [verifyHash, setVerifyHash] = useState('');
  const [isHashingVerify, setIsHashingVerify] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const verifyInputRef = useRef(null);

  // Verification result: 'verified' | 'failed' | null
  const [verifyResult, setVerifyResult] = useState(null);

  // UI state
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedVerify, setCopiedVerify] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showDemoTool, setShowDemoTool] = useState(false);
  const [demoText, setDemoText] = useState('File Integrity Demonstration - Version 1.0\nSecure Hash Algorithm: SHA-256');

  // Load baseline from localStorage on initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.sha256) {
          setBaseline(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to load baseline from localStorage:', err);
      showToast('Warning: Corrupted baseline in storage was reset.');
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3500);
  };

  // ─── Step 1 Handler: Process Original File ──────────────────────────────
  const handleOriginalFileSelected = async (file) => {
    if (!file) return;
    setOriginalError('');
    setIsHashingOriginal(true);
    try {
      const meta = {
        name: file.name,
        size: file.size,
        formattedSize: formatBytes(file.size),
        type: file.type || 'Unknown / Binary',
        lastModified: file.lastModified ? file.lastModified : null,
      };
      setOriginalFile(file);
      setOriginalMeta(meta);

      const hash = await calculateSHA256(file);
      setOriginalHash(hash);
      showToast(`SHA-256 calculated for "${file.name}"`);
    } catch (err) {
      console.error('Original file hash error:', err);
      setOriginalError(err.message || 'Failed to calculate SHA-256 hash.');
      setOriginalHash('');
      setOriginalFile(null);
      setOriginalMeta(null);
    } finally {
      setIsHashingOriginal(false);
    }
  };

  // ─── Step 2 Handler: Save Baseline to LocalStorage ───────────────────────
  const handleSaveBaseline = () => {
    if (!originalHash || !originalMeta) {
      showToast('Please select a file to hash first.');
      return;
    }
    const newBaseline = {
      fileName: originalMeta.name,
      fileSize: originalMeta.size,
      formattedSize: originalMeta.formattedSize,
      fileType: originalMeta.type,
      lastModified: originalMeta.lastModified,
      sha256: originalHash,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBaseline));
      setBaseline(newBaseline);
      showToast('✓ Baseline created and saved to localStorage.');

      // If a verification file was already loaded, auto re-evaluate
      if (verifyHash) {
        if (verifyHash === newBaseline.sha256) {
          setVerifyResult('verified');
        } else {
          setVerifyResult('failed');
        }
      }
    } catch (err) {
      console.error('Storage save error:', err);
      showToast('Error saving baseline to localStorage.');
    }
  };

  // ─── Step 2 Handler: Clear Baseline ─────────────────────────────────────
  const handleClearBaseline = () => {
    if (window.confirm('Are you sure you want to clear the stored baseline hash?')) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        setBaseline(null);
        setVerifyResult(null);
        showToast('Baseline cleared from storage.');
      } catch (err) {
        console.error('Storage remove error:', err);
      }
    }
  };

  // ─── Step 3 Handler: Process Verification File ──────────────────────────
  const handleVerifyFileSelected = async (file) => {
    if (!file) return;
    setVerifyError('');
    setIsHashingVerify(true);
    setVerifyResult(null);

    try {
      const meta = {
        name: file.name,
        size: file.size,
        formattedSize: formatBytes(file.size),
        type: file.type || 'Unknown / Binary',
        lastModified: file.lastModified ? file.lastModified : null,
      };
      setVerifyFile(file);
      setVerifyMeta(meta);

      const hash = await calculateSHA256(file);
      setVerifyHash(hash);

      // Compare with stored baseline if available
      if (baseline && baseline.sha256) {
        if (hash.toLowerCase() === baseline.sha256.toLowerCase()) {
          setVerifyResult('verified');
          showToast('✓ Integrity Verified: Hashes match perfectly!');
        } else {
          setVerifyResult('failed');
          showToast('✗ Integrity Failed: Hash mismatch detected!');
        }
      } else {
        showToast('File hashed! (Note: No baseline saved yet in Step 2 to verify against)');
      }
    } catch (err) {
      console.error('Verify file hash error:', err);
      setVerifyError(err.message || 'Failed to calculate SHA-256 hash for verification.');
      setVerifyHash('');
      setVerifyFile(null);
      setVerifyMeta(null);
      setVerifyResult(null);
    } finally {
      setIsHashingVerify(false);
    }
  };

  // ─── Copy to Clipboard ──────────────────────────────────────────────────
  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'original') {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    } else {
      setCopiedVerify(true);
      setTimeout(() => setCopiedVerify(false), 2000);
    }
    showToast('Hash copied to clipboard!');
  };

  // ─── Quick Demo Helper: Download Test Files ──────────────────────────────
  const handleDownloadDemoFile = (modified = false) => {
    const text = modified ? demoText + '\n[MODIFIED: Added 1 extra character]' : demoText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = modified ? 'demo_modified.txt' : 'demo_original.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(modified ? 'Downloaded demo_modified.txt' : 'Downloaded demo_original.txt');
  };

  return (
    <div className="app-container">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-badge">
          <KeyRound size={14} /> Cryptography & Network Security
        </div>
        <h1 className="header-title">
          <Shield size={38} /> File Integrity Checker
        </h1>
        <p className="header-subtitle">
          Verify file authenticity and detect unauthorized modifications using standard{' '}
          <strong style={{ color: '#818cf8' }}>SHA-256 cryptographic hashing</strong> (256-bit / 64 hex characters).
        </p>

        {/* Concept Flow */}
        <div className="concept-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={16} color="#818cf8" />
            <span>How it works:</span>
          </div>
          <div className="concept-steps">
            <span className="concept-step">Original File</span>
            <span className="concept-arrow">➔</span>
            <span className="concept-step">SHA-256 Hash</span>
            <span className="concept-arrow">➔</span>
            <span className="concept-step">Baseline</span>
            <span className="concept-arrow">➔</span>
            <span className="concept-step">Verify Target</span>
            <span className="concept-arrow">➔</span>
            <span className="concept-step" style={{ color: '#10b981' }}>Compare (Match / Mismatch)</span>
          </div>
        </div>
      </header>

      <main className="main-grid">
        {/* ─── STEP 1: Select Original File ───────────────────────────────── */}
        <section className="card">
          <div className="card-header">
            <div className="card-title-group">
              <div className="step-indicator">1</div>
              <div>
                <h2 className="card-title">Select Original File & Compute SHA-256</h2>
                <p className="card-description">
                  Upload the original, trusted reference file to calculate its 64-character SHA-256 checksum.
                </p>
              </div>
            </div>
          </div>

          <div
            className="dropzone"
            onClick={() => originalInputRef.current && originalInputRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleOriginalFileSelected(e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={originalInputRef}
              type="file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleOriginalFileSelected(e.target.files[0]);
                }
              }}
            />
            <div className="dropzone-icon">
              <UploadCloud size={24} />
            </div>
            <div className="dropzone-text">
              {originalFile ? originalFile.name : 'Click to select or drag & drop original file'}
            </div>
            <div className="dropzone-subtext">Supports any file type (.txt, .pdf, .jpg, .bin, .docx, etc.)</div>
          </div>

          {/* Loading Indicator */}
          {isHashingOriginal && (
            <div style={{ marginTop: 16, textAlign: 'center', color: '#818cf8', fontSize: '0.875rem' }}>
              Computing SHA-256 hash using Web Crypto API...
            </div>
          )}

          {/* Error display */}
          {originalError && (
            <div style={{ marginTop: 14, color: '#ef4444', fontSize: '0.875rem', display: 'flex', gap: 6 }}>
              <AlertTriangle size={18} /> {originalError}
            </div>
          )}

          {/* Metadata Display */}
          {originalMeta && (
            <div className="file-meta-grid">
              <div className="file-meta-item">
                <div className="file-meta-label">File Name</div>
                <div className="file-meta-value">{originalMeta.name}</div>
              </div>
              <div className="file-meta-item">
                <div className="file-meta-label">File Size</div>
                <div className="file-meta-value">{originalMeta.formattedSize} ({originalMeta.size} bytes)</div>
              </div>
              <div className="file-meta-item">
                <div className="file-meta-label">MIME Type</div>
                <div className="file-meta-value">{originalMeta.type}</div>
              </div>
              <div className="file-meta-item">
                <div className="file-meta-label">Last Modified</div>
                <div className="file-meta-value">{formatDate(originalMeta.lastModified)}</div>
              </div>
            </div>
          )}

          {/* Computed Hash Display */}
          {originalHash && (
            <div className="hash-container">
              <div className="hash-label">
                <span>Computed SHA-256 Hash <span className="hash-badge">64 HEX CHARACTERS / 256 BITS</span></span>
                <button
                  type="button"
                  className="btn-icon"
                  title="Copy SHA-256 Hash"
                  onClick={() => copyToClipboard(originalHash, 'original')}
                >
                  {copiedOriginal ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="hash-box">
                <span className="hash-text">{originalHash}</span>
              </div>
            </div>
          )}

          {/* Action Button for Step 2 */}
          {originalHash && (
            <div className="btn-group">
              <button type="button" className="btn btn-primary" onClick={handleSaveBaseline}>
                <Save size={18} /> Save as Original / Create Baseline
              </button>
            </div>
          )}
        </section>

        {/* ─── STEP 2: Baseline Storage ───────────────────────────────────── */}
        <section className="card baseline-card">
          <div className="card-header">
            <div className="card-title-group">
              <div className="step-indicator" style={{ background: '#3b82f6' }}>2</div>
              <div>
                <h2 className="card-title">Stored Baseline Hash (Reference)</h2>
                <p className="card-description">
                  The trusted cryptographic fingerprint saved in persistent browser storage (<code style={{ color: '#93c5fd' }}>localStorage</code>).
                </p>
              </div>
            </div>

            {baseline && (
              <div className="baseline-saved-pill">
                <Check size={14} /> Active Baseline
              </div>
            )}
          </div>

          {baseline ? (
            <div>
              <div className="file-meta-grid">
                <div className="file-meta-item">
                  <div className="file-meta-label">Baseline File</div>
                  <div className="file-meta-value">{baseline.fileName}</div>
                </div>
                <div className="file-meta-item">
                  <div className="file-meta-label">Baseline Size</div>
                  <div className="file-meta-value">{baseline.formattedSize}</div>
                </div>
                <div className="file-meta-item">
                  <div className="file-meta-label">Baseline Created</div>
                  <div className="file-meta-value">{formatDate(baseline.createdAt)}</div>
                </div>
              </div>

              <div className="hash-container">
                <div className="hash-label">
                  <span>Baseline SHA-256 Hash</span>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Copy Baseline Hash"
                    onClick={() => copyToClipboard(baseline.sha256, 'original')}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="hash-box" style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}>
                  <span className="hash-text" style={{ color: '#93c5fd' }}>{baseline.sha256}</span>
                </div>
              </div>

              <div className="btn-group">
                <button type="button" className="btn btn-danger-outline btn-sm" onClick={handleClearBaseline}>
                  <Trash2 size={16} /> Clear Baseline
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-baseline-box">
              <KeyRound className="empty-baseline-icon" />
              <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>No Baseline Saved Yet</div>
              <p style={{ fontSize: '0.875rem' }}>
                Select a file in <strong>Step 1</strong> and click <strong>"Save as Original / Create Baseline"</strong> to store its reference hash.
              </p>
            </div>
          )}
        </section>

        {/* ─── STEP 3: Verify File Integrity ──────────────────────────────── */}
        <section className="card">
          <div className="card-header">
            <div className="card-title-group">
              <div className="step-indicator" style={{ background: '#10b981' }}>3</div>
              <div>
                <h2 className="card-title">Verify File Integrity</h2>
                <p className="card-description">
                  Upload a file to test whether it is authentic and unmodified compared to the baseline.
                </p>
              </div>
            </div>
          </div>

          <div
            className="dropzone"
            onClick={() => verifyInputRef.current && verifyInputRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleVerifyFileSelected(e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              ref={verifyInputRef}
              type="file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleVerifyFileSelected(e.target.files[0]);
                }
              }}
            />
            <div className="dropzone-icon" style={{ color: '#10b981' }}>
              <FileCheck2 size={24} />
            </div>
            <div className="dropzone-text">
              {verifyFile ? verifyFile.name : 'Click to select or drag & drop file to verify'}
            </div>
            <div className="dropzone-subtext">Select any file to recalculate SHA-256 and compare</div>
          </div>

          {/* Verification Loading Indicator */}
          {isHashingVerify && (
            <div style={{ marginTop: 16, textAlign: 'center', color: '#10b981', fontSize: '0.875rem' }}>
              Computing target file SHA-256 hash...
            </div>
          )}

          {/* Verify Error */}
          {verifyError && (
            <div style={{ marginTop: 14, color: '#ef4444', fontSize: '0.875rem', display: 'flex', gap: 6 }}>
              <AlertTriangle size={18} /> {verifyError}
            </div>
          )}

          {/* Verification Meta */}
          {verifyMeta && (
            <div className="file-meta-grid">
              <div className="file-meta-item">
                <div className="file-meta-label">Selected File</div>
                <div className="file-meta-value">{verifyMeta.name}</div>
              </div>
              <div className="file-meta-item">
                <div className="file-meta-label">Size</div>
                <div className="file-meta-value">{verifyMeta.formattedSize} ({verifyMeta.size} bytes)</div>
              </div>
              <div className="file-meta-item">
                <div className="file-meta-label">Last Modified</div>
                <div className="file-meta-value">{formatDate(verifyMeta.lastModified)}</div>
              </div>
            </div>
          )}

          {/* Verification Computed Hash */}
          {verifyHash && (
            <div className="hash-container">
              <div className="hash-label">
                <span>Calculated Current SHA-256 Hash</span>
                <button
                  type="button"
                  className="btn-icon"
                  title="Copy Calculated Hash"
                  onClick={() => copyToClipboard(verifyHash, 'verify')}
                >
                  {copiedVerify ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="hash-box">
                <span className="hash-text" style={{ color: '#6ee7b7' }}>{verifyHash}</span>
              </div>
            </div>
          )}

          {/* ─── Verification Result Banner ───────────────────────────────── */}
          {verifyResult === 'verified' && (
            <div className="result-card result-verified">
              <div className="result-header">
                <div className="result-status-icon">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <div className="result-title">✓ INTEGRITY VERIFIED</div>
                  <div className="result-message">
                    The file has <strong>NOT</strong> been modified. The cryptographic SHA-256 checksum exactly matches the stored baseline.
                  </div>
                </div>
              </div>

              <div className="hash-comparison-grid">
                <div className="compare-row">
                  <div className="compare-label">
                    <span>Original Baseline SHA-256</span>
                    <span style={{ color: '#10b981' }}>MATCH</span>
                  </div>
                  <div className="compare-hash original">{baseline?.sha256}</div>
                </div>
                <div className="compare-row">
                  <div className="compare-label">
                    <span>Current File SHA-256</span>
                    <span style={{ color: '#10b981' }}>MATCH</span>
                  </div>
                  <div className="compare-hash verified">{verifyHash}</div>
                </div>
              </div>
            </div>
          )}

          {verifyResult === 'failed' && (
            <div className="result-card result-failed">
              <div className="result-header">
                <div className="result-status-icon">
                  <ShieldAlert size={28} />
                </div>
                <div>
                  <div className="result-title">✗ INTEGRITY FAILED</div>
                  <div className="result-message">
                    The file has been <strong>MODIFIED</strong> or is different from the original baseline.
                  </div>
                </div>
              </div>

              <div className="hash-comparison-grid">
                <div className="compare-row">
                  <div className="compare-label">
                    <span>Original Baseline SHA-256</span>
                    <span style={{ color: '#ef4444' }}>MISMATCH</span>
                  </div>
                  <div className="compare-hash original">{baseline?.sha256}</div>
                </div>
                <div className="compare-row">
                  <div className="compare-label">
                    <span>Current File SHA-256</span>
                    <span style={{ color: '#ef4444' }}>MISMATCH</span>
                  </div>
                  <div className="compare-hash failed">{verifyHash}</div>
                </div>
              </div>

              {/* Avalanche Effect Explainer */}
              <div className="avalanche-callout">
                <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Avalanche Effect Demonstrated:</strong> Even changing a single character or byte in the input produces a drastically different 256-bit cryptographic output. This guarantees tamper detection.
                </div>
              </div>
            </div>
          )}

          {!baseline && verifyHash && (
            <div className="avalanche-callout" style={{ marginTop: 18 }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>No baseline active:</strong> Click <strong>"Save as Original / Create Baseline"</strong> in Step 1 to save a baseline so this file can be automatically compared.
              </div>
            </div>
          )}
        </section>

        {/* ─── Interactive Quick Demo / Viva Helper ──────────────────────── */}
        <section className="demo-tool">
          <div className="demo-tool-header" onClick={() => setShowDemoTool(!showDemoTool)}>
            <div className="demo-tool-title">
              <FileText size={18} color="#818cf8" />
              <span>Viva Demonstration Tool: Quick File Generator</span>
            </div>
            {showDemoTool ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
          </div>

          {showDemoTool && (
            <div className="demo-content">
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: 12 }}>
                Use this built-in utility to download sample test files to test both <strong>Verified</strong> (identical) and <strong>Failed</strong> (tampered) states during project presentation.
              </p>

              <textarea
                className="demo-textarea"
                value={demoText}
                onChange={(e) => setDemoText(e.target.value)}
                placeholder="Type sample text to generate a test file..."
              />

              <div className="btn-group" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleDownloadDemoFile(false)}>
                  <Download size={14} /> Download Original File (demo_original.txt)
                </button>
                <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => handleDownloadDemoFile(true)}>
                  <Download size={14} /> Download Tampered File (demo_modified.txt)
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ─── Toast Notification ─────────────────────────────────────────── */}
      {toastMessage && (
        <div className="toast">
          <Info size={18} color="#818cf8" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="footer">
        <div>File Integrity Checker Using SHA-256 • Cryptography and Network Security Mini-Project</div>
        <div style={{ marginTop: 4, color: '#475569', fontSize: '0.75rem' }}>
          Powered by browser native Web Crypto API (<code style={{ color: '#64748b' }}>crypto.subtle.digest</code>) & LocalStorage
        </div>
      </footer>
    </div>
  );
}
