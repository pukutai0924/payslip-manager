// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { Camera, List, FileText, Upload, Search, ArrowLeft } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format, setMonth, setYear } from 'date-fns';
import { ja } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import './App.css';

/* global gapi, google */

// 環境変数から API キーとクライアント ID を取得
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// Google Drive API のスコープ
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive';

// ローカルストレージのキー
const AUTH_STORAGE_KEY = 'google_auth_token';

// 日付を安全に処理する関数
const safeParseDate = (dateString) => {
  if (!dateString) return new Date();
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date() : date;
  } catch (error) {
    console.warn('日付の解析に失敗:', error);
    return new Date();
  }
};

// メインアプリケーション
function App() {
  const [view, setView] = useState('login');
  const [payslips, setPayslips] = useState([]);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stream, setStream] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem(AUTH_STORAGE_KEY) || null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const videoRef = useRef(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [capturedImage, setCapturedImage] = useState(null);
  const [payslipFolderId, setPayslipFolderId] = useState(null);
  const [years, setMonths] = useState([]);

  // Google API の初期化を改善
  useEffect(() => {
    const initializeGoogleApi = async () => {
      try {
        if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID) {
          throw new Error('Google API の認証情報が設定されていません。');
        }

        console.log('Google API の初期化を開始...');
        
        // Google API スクリプトの読み込みを確認
        if (!window.gapi) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
          });
        }

        // Google API クライアントの初期化
        await new Promise((resolve) => {
          window.gapi.load('client:auth2', resolve);
        });

        await window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: SCOPES
        });

        // Token Client の初期化
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              setAccessToken(tokenResponse.access_token);
              setIsAuthenticated(true);
              localStorage.setItem(AUTH_STORAGE_KEY, tokenResponse.access_token);
              gapi.client.setToken({ access_token: tokenResponse.access_token });
              setIsGoogleApiLoaded(true);
              setView('home');
              fetchPayslips();
            }
          }
        });

        setTokenClient(client);
        setIsGoogleApiLoaded(true);

        // 保存されたトークンがある場合は明細一覧を取得
        if (isAuthenticated && accessToken) {
          gapi.client.setToken({ access_token: accessToken });
          setView('home');
          await fetchPayslips();
        } else {
          setView('login');
        }

      } catch (error) {
        console.error('Google API の初期化に失敗:', error);
        alert('Google API の初期化に失敗しました。ページを更新してください。');
        setView('login');
      } finally {
        setIsInitialized(true);
        setIsLoading(false);
      }
    };

    initializeGoogleApi();
  }, []);

  return (
    <div className="App">
      {/* Your JSX content here */}
    </div>
  );
}

export default App;