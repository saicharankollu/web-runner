import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import axios from 'axios';
import dynamic from 'next/dynamic';
import styles from '../styles/Home.module.css';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [isHumanChecked, setIsHumanChecked] = useState(false);
  const [status, setStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    async function start() {
      const r = await axios.post('/api/anti-bot/start');
      setSessionId(r.data.sessionId);
      const saved = localStorage.getItem('webRunnerApiKey') || '';
      setApiKey(saved);
    }
    start();
  }, []);

  useEffect(() => {
    if (apiKey) localStorage.setItem('webRunnerApiKey', apiKey);
  }, [apiKey]);

  async function handleGenerate() {
    if (!isHumanChecked) {
      alert('Please confirm you are not a robot');
      return;
    }
    if (!sessionId) return;
    if (!apiKey) {
      if (!confirm('You have not provided a Google AI Studio API key. Continue?')) return;
    }
    setStatus('Starting generation...');
    try {
      const resp = await axios.post('/api/generate', { prompt, sessionId, template: 'react-vite-tailwind', userApiKey: apiKey });
      setWorkspaceId(resp.data.workspaceId);
      setStatus('Generation completed. Refreshing file list...');
      setTimeout(() => fetchFiles(resp.data.workspaceId), 800);
    } catch (err) {
      console.error(err);
      setStatus('Generation failed: ' + (err?.response?.data?.error || err.message));
    }
  }

  async function fetchFiles(id) {
    if (!id) return;
    try {
      const r = await axios.get(`/api/workspace/${id}/files`);
      setFiles(r.data.files);
      if (r.data.files.length > 0) {
        setSelectedFile(r.data.files[0].path);
        fetchFileContent(id, r.data.files[0].path);
      }
      setPreviewUrl(`/preview/${id}/index.html`);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchFileContent(id, path) {
    try {
      const r = await axios.get(`/api/workspace/${id}/file`, { params: { path } });
      setFileContent(r.data.content || '');
    } catch (err) {
      console.error(err);
    }
  }

  async function saveFile() {
    if (!workspaceId || !selectedFile) return;
    try {
      await axios.post(`/api/workspace/${workspaceId}/patch`, { path: selectedFile, content: fileContent });
      setStatus('Saved.');
      fetch(`/preview/${workspaceId}/index.html`).catch(() => {});
    } catch (err) {
      console.error(err);
      setStatus('Save failed.');
    }
  }

  async function downloadZip() {
    if (!workspaceId) return;
    window.location.href = `/api/workspace/${workspaceId}/export.zip`;
  }

  return (
    <>
      <Head>
        <title>Web Runner</title>
      </Head>
      <main className={styles.container}>
        <h1 className={styles.title}>Web Runner</h1>

        <section className={styles.controls}>
          <div className={styles.inlineRow}>
            <input className={styles.apiInput} placeholder="Google AI Studio API Key (paste here)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <button className={styles.smallBtn} onClick={() => { setApiKey(''); localStorage.removeItem('webRunnerApiKey'); }}>Clear</button>
            <button className={styles.smallBtn} onClick={() => window.open('https://studio.google.com/', '_blank')}>Get key</button>
          </div>
          <textarea className={styles.prompt} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your website idea..." />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={isHumanChecked} onChange={(e) => setIsHumanChecked(e.target.checked)} />
            Are you not a robot?
          </label>
          <div className={styles.actionRow}>
            <button className={styles.generateBtn} onClick={handleGenerate}>Generate</button>
            <button onClick={() => fetchFiles(workspaceId)} disabled={!workspaceId}>Refresh files</button>
            <button onClick={downloadZip} disabled={!workspaceId}>Export ZIP</button>
          </div>
          <div className={styles.howto}>
            <strong>How to get a free Google AI Studio key:</strong>
            <ol>
              <li>Go to <a href="https://studio.google.com/" target="_blank" rel="noreferrer">studio.google.com</a> and sign in.</li>
              <li>Create a new project or select an existing one and enable the PaLM/Text Generation API.</li>
              <li>Create an API key in the project credentials and copy it.</li>
              <li>Paste the key into the "Google AI Studio API Key" input above. The key is stored only in your browser's localStorage.</li>
            </ol>
          </div>
          <div className={styles.status}>{status}</div>
        </section>

        <section className={styles.workspace}>
          <aside className={styles.fileTree}>
            <h3>Files</h3>
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  <button className={selectedFile === f.path ? styles.fileActive : ''} onClick={() => { setSelectedFile(f.path); fetchFileContent(workspaceId, f.path); }}>{f.path}</button>
                </li>
              ))}
            </ul>
          </aside>

          <div className={styles.editorPane}>
            <MonacoEditor height="50vh" defaultLanguage="javascript" value={fileContent} onChange={(val) => setFileContent(val || '')} options={{ minimap: { enabled: false } }} />
            <div className={styles.editorButtons}>
              <button className={styles.saveBtn} onClick={saveFile}>Save</button>
            </div>
          </div>

          <div className={styles.previewPane}>
            <h3>Live preview</h3>
            {previewUrl ? <iframe src={previewUrl} style={{width: '100%', height: '60vh', border: '1px solid #ddd'}} /> : <div>No preview</div>}
          </div>
        </section>
      </main>
    </>
  );
}
