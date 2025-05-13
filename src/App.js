// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { Camera, List, FileText, Upload, Search, ArrowLeft } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { format, setMonth, setYear } from 'date-fns';
import { ja } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import './App.css'; // 通常のCSSファイルを使用

/* global gapi, google */

// 環境変数からAPIキーとクライアントIDを取得
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// デバッグ用：環境変数の確認
//console.log('環境変数の確認:');
//console.log('API Key exists:', !!GOOGLE_API_KEY);
//console.log('Client ID exists:', !!GOOGLE_CLIENT_ID);

// Google Drive APIのスコープ
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive';

// ローカルストレージのキー
const AUTH_STORAGE_KEY = 'google_auth_token';

// 日付を安全に処理する関数
const safeParseDate = (dateString) => {
  if (!dateString) {
    console.warn('日付が未定義です');
    return new Date();
  }
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('無効な日付:', dateString);
      return new Date();
    }
    return date;
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
  const [years, months] = useState([]);

  // トースト通知を表示する関数
  const showToastMessage = () => {
    setShowToast(false); // 一度非表示にして
    setTimeout(() => {
      setShowToast(true); // 再度表示
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }, 100);
  };

  // 給与明細フォルダの取得または作成
  const getOrCreatePayslipFolder = async () => {
    try {
      // 既存のフォルダを検索
      const response = await gapi.client.drive.files.list({
        q: "name = '給与明細' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      const folders = response.result.files;
      
      if (folders.length > 0) {
        // 既存のフォルダが見つかった場合
        console.log('既存の給与明細フォルダを使用:', folders[0].id);
        return folders[0].id;
      }

      // フォルダが存在しない場合は新規作成
      const folderMetadata = {
        name: '給与明細',
        mimeType: 'application/vnd.google-apps.folder'
      };

      const createResponse = await gapi.client.drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });

      console.log('新しい給与明細フォルダを作成:', createResponse.result.id);
      return createResponse.result.id;
    } catch (error) {
      console.error('フォルダの取得/作成に失敗:', error);
      throw error;
    }
  };

  // Google Driveから明細一覧を取得
  const fetchPayslips = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      console.log('明細一覧の取得を開始...');
      
      if (!isAuthenticated) {
        console.log('認証が必要です...');
        await requestToken();
      } else {
        gapi.client.setToken({ access_token: accessToken });
      }

      // 給与明細フォルダのIDを取得
      const folderId = await getOrCreatePayslipFolder();

      console.log('Drive APIにアクセス...');
      // 給与明細フォルダ内のファイルを検索
      const response = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name contains '給与明細' and mimeType contains 'image/' and trashed = false`,
        fields: 'files(id, name, createdTime, webContentLink, thumbnailLink, imageMediaMetadata, mimeType)',
        orderBy: 'createdTime desc',
        spaces: 'drive',
        pageSize: 100
      });

      console.log('ファイル一覧を取得:', response.result.files.length, '件');
      const files = response.result.files;
      
      if (files.length === 0) {
        console.log('ファイルが見つかりませんでした');
        setPayslips([]);
        return;
      }

      // ファイルの詳細情報を取得
      const payslipsData = await Promise.all(
        files.map(async (file) => {
          try {
            console.log('ファイル情報を取得中:', file.name, file.mimeType);
            
            // ファイルのメタデータを取得
            const fileResponse = await gapi.client.drive.files.get({
              fileId: file.id,
              fields: 'id, name, createdTime, webContentLink, thumbnailLink, imageMediaMetadata, mimeType'
            });

            const fileData = fileResponse.result;
            console.log('ファイルデータ:', fileData.name, fileData.mimeType);
            
            // サムネイルURL（認証不要）を優先
            const thumbnailUrl = fileData.thumbnailLink || null;
            
            // 日付を安全に処理
            const createdDate = safeParseDate(fileData.createdTime || new Date().toISOString());
            
            return {
              id: fileData.id,
              title: fileData.name || '無題のファイル',
              date: createdDate.toISOString().slice(0, 7),
              createdTime: createdDate.toISOString(),
              thumbnailUrl: thumbnailUrl,
              fileId: fileData.id,
              webContentLink: fileData.webContentLink,
              mimeType: fileData.mimeType
            };
          } catch (error) {
            console.error('ファイルの取得に失敗:', file.id, error);
            return null;
          }
        })
      );

      // エラーで取得できなかったファイルを除外
      const validPayslips = payslipsData.filter(payslip => payslip !== null);
      console.log('有効な明細一覧を設定:', validPayslips.length, '件');
      
      // 重複を排除（同じファイル名の場合は最新のものを保持）
      const uniquePayslips = validPayslips.reduce((acc, current) => {
        const existingIndex = acc.findIndex(item => item.title === current.title);
        if (existingIndex === -1) {
          acc.push(current);
        } else if (new Date(current.createdTime) > new Date(acc[existingIndex].createdTime)) {
          acc[existingIndex] = current;
        }
        return acc;
      }, []);

      console.log('重複を排除した明細一覧を設定:', uniquePayslips.length, '件');
      setPayslips(uniquePayslips);
    } catch (error) {
      console.error('明細一覧の取得に失敗しました:', error);
      if (error.status === 401 || error.status === 403) {
        clearAuth();
        try {
          await requestToken();
          await fetchPayslips();
        } catch (retryError) {
          console.error('再認証に失敗しました:', retryError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // トークンの取得を要求
  const requestToken = async () => {
    if (!tokenClient) {
      throw new Error('認証クライアントが初期化されていません');
    }

    if (isAuthenticated && accessToken) {
      // 既存のトークンを設定
      gapi.client.setToken({ access_token: accessToken });
      return { access_token: accessToken };
    }

    return new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          setAccessToken(response.access_token);
          setIsAuthenticated(true);
          localStorage.setItem(AUTH_STORAGE_KEY, response.access_token);
          // 新しいトークンを設定
          gapi.client.setToken({ access_token: response.access_token });
          resolve(response);
        }
      };
      tokenClient.requestAccessToken({
        prompt: '',
        ux_mode: 'redirect',
        redirect_uri: window.location.origin
      });
    });
  };

  // 認証状態のクリア
  const clearAuth = () => {
    setAccessToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  // Google APIの初期化
  useEffect(() => {
    const initializeGoogleApi = async () => {
      try {
        console.log('Google APIの初期化を開始...');
        
        await new Promise((resolve) => {
          if (window.gapi) {
            resolve();
          } else {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            document.body.appendChild(script);
          }
        });

        await gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: GOOGLE_API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });

            console.log('Drive APIの初期化が完了');

            // Token Clientの初期化
            const client = google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: SCOPES,
              callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                  console.log('認証成功');
                  setAccessToken(tokenResponse.access_token);
                  setIsAuthenticated(true);
                  localStorage.setItem(AUTH_STORAGE_KEY, tokenResponse.access_token);
                  gapi.client.setToken({ access_token: tokenResponse.access_token });
                  setIsGoogleApiLoaded(true);
                  setView('home');  // 認証成功時にホーム画面に遷移
                  fetchPayslips();
                }
              },
              prompt: '',
              ux_mode: 'redirect',
              redirect_uri: window.location.origin
            });

            setTokenClient(client);
            setIsGoogleApiLoaded(true);
            console.log('Token Clientの初期化が完了');

            // 保存されたトークンがある場合は明細一覧を取得
            if (isAuthenticated && accessToken) {
              console.log('保存されたトークンを使用して明細一覧を取得');
              gapi.client.setToken({ access_token: accessToken });
              setView('home');  // トークンがある場合はホーム画面に遷移
              await fetchPayslips();
            } else {
              setView('login');  // トークンがない場合はログイン画面に遷移
            }
          } catch (error) {
            console.error('Google APIの初期化に失敗しました:', error);
            setView('login');  // エラー時はログイン画面に遷移
          } finally {
            setIsInitialized(true);
            setIsLoading(false);
          }
        });
      } catch (error) {
        console.error('Google APIの初期化に失敗しました:', error);
        setIsInitialized(true);
        setIsLoading(false);
        setView('login');  // エラー時はログイン画面に遷移
      }
    };

    initializeGoogleApi();
  }, []);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      fetchPayslips();
    }
  }, [isAuthenticated, accessToken, fetchPayslips]);

  useEffect(() => {
    fetchPayslips();
  }, [fetchPayslips]);

  useEffect(() => {
    if (stream) {
      setStream(stream);
    }
  }, [stream, setStream]);

  // カメラストリームの停止処理
  const stopCameraStream = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('カメラストリームを停止:', track.label);
      });
      setStream(null);
    }
  };

  // ホーム画面に戻る処理を修正
  const handleBackToHome = () => {
    stopCameraStream();
    setView('home');
  };

  // ログイン処理
  const handleLogin = async () => {
    try {
      console.log('ログイン処理を開始...');
      
      if (!window.google) {
        throw new Error('Google Identity Servicesが読み込まれていません');
      }

      // Google Identity Servicesを使用して認証
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: async (response) => {
          if (response.error) {
            console.error('認証エラー:', response.error);
            alert('ログインに失敗しました。もう一度お試しください。');
            return;
          }

          try {
            console.log('認証成功、トークンを保存...');
            const token = response.access_token;
            localStorage.setItem(AUTH_STORAGE_KEY, token);
            setAccessToken(token);
            setIsAuthenticated(true);
            setView('home');
          } catch (error) {
            console.error('トークン保存エラー:', error);
            alert('ログインに失敗しました。もう一度お試しください。');
          }
        },
        error_callback: (error) => {
          console.error('認証エラー:', error);
          alert('ログインに失敗しました。もう一度お試しください。');
        }
      });

      console.log('認証を開始...');
      client.requestAccessToken();
    } catch (error) {
      console.error('ログインエラー:', error);
      alert('ログインに失敗しました。もう一度お試しください。\nエラー: ' + error.message);
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      showToastMessage();
      
      if (!gapi.auth2) {
        console.log('Google APIが初期化されていません');
        clearAuth();
        setView('login');
        return;
      }

      const googleAuth = gapi.auth2.getAuthInstance();
      if (googleAuth) {
        await googleAuth.signOut();
      }
      
      clearAuth();
      setView('login');
    } catch (error) {
      console.error('ログアウトエラー:', error);
      clearAuth();
      setView('login');
      showToastMessage();
    }
  };

  // ローディング中の表示
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // 未認証時の表示
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">給与明細管理アプリ</h1>
          <p className="login-subtitle">Googleアカウントでログインして、給与明細を簡単に管理</p>
          <button onClick={handleLogin} className="login-button">
            <img 
              src="https://www.google.com/favicon.ico" 
              alt="Google" 
              className="login-icon"
            />
            Googleでログイン
          </button>
        </div>
        
        <div className="login-features">
          <div className="feature-item">
            <div className="feature-icon">📱</div>
            <h3 className="feature-title">簡単撮影</h3>
            <p className="feature-description">
              スマートフォンのカメラで給与明細を撮影するだけ
            </p>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon">☁️</div>
            <h3 className="feature-title">クラウド保存</h3>
            <p className="feature-description">
              Googleドライブに自動保存で安全に管理
            </p>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon">🔍</div>
            <h3 className="feature-title">簡単検索</h3>
            <p className="feature-description">
              過去の給与明細を素早く検索・閲覧
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 写真を撮影する関数
  const capturePhoto = async () => {
    if (videoRef.current) {
      try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageUrl);
        setShowDateModal(true);
      } catch (error) {
        alert('撮影に失敗しました: ' + error.message);
      }
    }
  };

  // 年月を選択して保存
  const handleSaveWithDate = async () => {
    if (!capturedImage) return;

    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      const fileName = `給与明細_${year}年${month}月.jpg`;
      
      // 画像をアップロード
      const fileId = await uploadToGoogleDrive(capturedImage, fileName);
      
      // ファイルの情報を取得
      const fileResponse = await gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'id, name, createdTime, webContentLink, thumbnailLink, imageMediaMetadata, mimeType'
      });
      
      const fileData = fileResponse.result;
      const newPayslip = {
        id: fileId,
        title: fileData.name,
        date: `${year}-${String(month).padStart(2, '0')}`,
        createdTime: fileData.createdTime,
        thumbnailUrl: fileData.thumbnailLink || null,
        fileId: fileId,
        webContentLink: fileData.webContentLink,
        mimeType: fileData.mimeType
      };
      
      setPayslips(prevPayslips => [newPayslip, ...prevPayslips]);
      alert('給与明細を保存しました！');
      
      // カメラストリームを停止してからホーム画面に戻る
      stopCameraStream();
      setView('home');
    } catch (error) {
      alert('保存に失敗しました: ' + error.message);
    } finally {
      setShowDateModal(false);
      setCapturedImage(null);
    }
  };

  // Google Driveにファイルをアップロード
  const uploadToGoogleDrive = async (fileData, fileName) => {
    try {
      setIsUploading(true);

      if (!isAuthenticated) {
        await requestToken();
      }

      // 給与明細フォルダのIDを取得
      const folderId = await getOrCreatePayslipFolder();

      let blob;
      let mimeType;

      // データタイプの判定と処理
      if (fileData instanceof Blob) {
        // すでにBlobの場合はそのまま使用
        blob = fileData;
        mimeType = fileData.type;
      } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        // Base64データの場合
        const base64Data = fileData.split(',')[1];
        mimeType = fileData.split(',')[0].split(':')[1].split(';')[0];
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        blob = new Blob([ab], { type: mimeType });
      } else {
        throw new Error('無効なファイルデータです');
      }

      const metadata = {
        name: fileName,
        mimeType: mimeType,
        parents: [folderId],
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('アップロードに失敗しました');
      }

      const result = await response.json();
      await fetchPayslips();
      return result.id;
    } catch (error) {
      console.error('Google Driveへのアップロードに失敗しました:', error);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  // フィルター処理された給与明細リスト
  const filteredPayslips = payslips.filter(payslip => {
    if (!payslip || !payslip.title) return false;
    const searchLower = (searchTerm || '').toLowerCase();
    const titleLower = payslip.title.toLowerCase();
    return titleLower.includes(searchLower);
  });

  return (
    <div className="app-container">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-content">
          {view !== 'home' && (
            <button 
              onClick={handleBackToHome}
              className="back-button"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <h1 className="header-title">
            {view === 'home' && '給与明細管理'}
            {view === 'camera' && '新規給与明細'}
            {view === 'list' && '給与明細一覧'}
            {view === 'detail' && '給与明細詳細'}
          </h1>
          <div className="spacer"></div>
          <button 
            onClick={handleLogout}
            className="logout-button"
            title="ログアウト"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="app-main">
        {view === 'home' && (
          <HomeView 
            onCameraClick={() => setView('camera')} 
            onListClick={() => setView('list')}
            isGoogleApiLoaded={isGoogleApiLoaded}
          />
        )}
        
        {view === 'camera' && (
          <CameraView 
            onCapture={capturePhoto}
            videoRef={videoRef}
            stream={stream}
            setStream={setStream}
            isUploading={isUploading}
          />
        )}
        
        {view === 'list' && (
          <ListView 
            payslips={filteredPayslips} 
            onPayslipClick={(payslip) => {
              setSelectedPayslip(payslip);
              setView('detail');
            }}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        )}
        
        {view === 'detail' && selectedPayslip && (
          <DetailView payslip={selectedPayslip} />
        )}
      </main>

      {/* フッターナビゲーション */}
      <footer className="app-footer">
        <nav className="footer-nav">
          <button 
            onClick={handleBackToHome}
            className={`nav-button ${view === 'home' ? 'active' : ''}`}
          >
            <FileText size={24} />
            <span className="nav-label">ホーム</span>
          </button>
          <button 
            onClick={() => setView('camera')} 
            className={`nav-button ${view === 'camera' ? 'active' : ''}`}
          >
            <Camera size={24} />
            <span className="nav-label">撮影</span>
          </button>
          <button 
            onClick={() => setView('list')} 
            className={`nav-button ${view === 'list' ? 'active' : ''}`}
          >
            <List size={24} />
            <span className="nav-label">一覧</span>
          </button>
        </nav>
      </footer>

      {/* 年月選択モーダル */}
      {showDateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">給与明細の年月を選択</h2>
            <div className="date-picker-container">
              <DatePicker
                selected={selectedDate}
                onChange={date => setSelectedDate(date)}
                dateFormat="yyyy年MM月"
                showMonthYearPicker
                locale={ja}
                inline
                minDate={new Date(new Date().getFullYear() - 40, 0, 1)}
                maxDate={new Date()}
              />
            </div>
            <div className="modal-buttons">
              <button 
                className="modal-button cancel-button"
                onClick={() => {
                  setShowDateModal(false);
                  setCapturedImage(null);
                }}
              >
                キャンセル
              </button>
              <button 
                className="modal-button save-button"
                onClick={handleSaveWithDate}
                disabled={isUploading}
              >
                {isUploading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト通知 */}
      <div className="toast-container">
        {showToast && (
          <div className="toast show">
            <svg 
              className="toast-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            ログアウトしました
          </div>
        )}
      </div>
    </div>
  );
}

// ホーム画面
function HomeView({ onCameraClick, onListClick, isGoogleApiLoaded }) {
  return (
    <div className="home-view">
      <h2 className="home-title">給与明細管理アプリ</h2>
      <p className="home-description">
        給与明細を撮影してGoogleドライブに保存し、簡単に管理できます。
      </p>
      
      <div className="home-buttons">
        <button
          onClick={onCameraClick}
          className="home-button camera-button"
          disabled={!isGoogleApiLoaded}
        >
          <Camera size={36} />
          <span className="button-label">新規撮影</span>
        </button>
        
        <button
          onClick={onListClick}
          className="home-button list-button"
          disabled={!isGoogleApiLoaded}
        >
          <List size={36} />
          <span className="button-label">明細一覧</span>
        </button>
      </div>

      {!isGoogleApiLoaded && (
        <div className="loading-notice">
          Google APIの読み込み中です...
        </div>
      )}
    </div>
  );
}

// カメラ画面
function CameraView({ onCapture, videoRef, stream, setStream, isUploading }) {
  const [permission, setPermission] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    let mounted = true;

    async function setupCamera() {
      try {
        setIsLoading(true);
        setError(null);

        // 利用可能なカメラを確認
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
          throw new Error('カメラが見つかりません。');
        }

        // カメラの設定
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (mounted) {
          setStream(mediaStream);
          setPermission(true);
          setError(null);
        }
      } catch (err) {
        console.error('カメラのアクセスに失敗しました:', err);
        let errorMessage = 'カメラへのアクセスに失敗しました。';
        
        if (err.name === 'NotAllowedError') {
          errorMessage = 'カメラの使用が許可されていません。ブラウザの設定を確認してください。';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'カメラが見つかりません。';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'カメラが他のアプリケーションで使用中です。';
        }
        
        if (mounted) {
          setError(errorMessage);
          setPermission(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    setupCamera();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(error => {
        console.error('ビデオの再生に失敗しました:', error);
      });
    }
  }, [stream, videoRef]);

  if (isLoading) {
    return (
      <div className="camera-view">
        <div className="loading-message">
          <p>カメラを初期化中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-view">
      {error ? (
        <div className="error-message">
          <p>{error}</p>
          <button 
            className="retry-button"
            onClick={() => window.location.reload()}
          >
            再試行
          </button>
        </div>
      ) : !permission ? (
        <div className="permission-request">
          <p className="permission-text">カメラへのアクセス許可が必要です</p>
          <button 
            className="permission-button"
            onClick={() => window.location.reload()}
          >
            許可する
          </button>
        </div>
      ) : (
        <>
          <div className="camera-preview-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="camera-preview"
            />
            <div className="camera-frame"></div>
          </div>
          
          <div className="capture-button-container">
            <button 
              onClick={onCapture}
              className="capture-button"
              disabled={isUploading}
            >
              {isUploading ? '保存中...' : '撮影'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// 明細一覧画面
function ListView({ payslips, onPayslipClick, searchTerm, onSearchChange }) {
  console.log('ListView - 表示する明細一覧:', payslips);

  // 重複を排除した一意のキーを生成
  const getUniqueKey = (payslip) => {
    return `${payslip.id}-${payslip.createdTime}`;
  };

  return (
    <div className="list-view">
      <div className="search-container">
        <input
          type="text"
          placeholder="給与明細を検索..."
          value={searchTerm || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
        <Search size={18} className="search-icon" />
      </div>
      
      {payslips.length === 0 ? (
        <div className="empty-list">
          <FileText size={48} className="empty-icon" />
          <p className="empty-text">給与明細がありません</p>
        </div>
      ) : (
        <ul className="payslip-list">
          {payslips.map(payslip => {
            console.log('明細を表示:', payslip.title, payslip.id);
            return (
              <li 
                key={getUniqueKey(payslip)}
                onClick={() => onPayslipClick(payslip)}
                className="payslip-item"
              >
                <div className="payslip-thumbnail">
                  <img 
                    src={payslip.thumbnailUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lj5HpgIHmlofnq6A8L3RleHQ+PC9zdmc+'}
                    alt={payslip.title || '給与明細'}
                    className="thumbnail-image"
                    loading="lazy"
                    onError={(e) => {
                      console.log('画像読み込みエラー:', payslip.title);
                      e.target.onerror = null;
                      e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lj5HpgIHmlofnq6A8L3RleHQ+PC9zdmc+';
                    }}
                  />
                </div>
                <div className="payslip-info">
                  <h3 className="payslip-title">{payslip.title || '無題のファイル'}</h3>
                  <p className="payslip-date">
                    保存日: {safeParseDate(payslip.createdTime).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 明細詳細画面
function DetailView({ payslip }) {
  return (
    <div className="detail-view">
      <div className="detail-card">
        <h2 className="detail-title">{payslip.title || '無題のファイル'}</h2>
        <p className="detail-date">保存日: {safeParseDate(payslip.createdTime).toLocaleDateString('ja-JP')}</p>
        
        <div className="detail-image-container">
          <img 
            src={payslip.thumbnailUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lj5HpgIHmlofnq6A8L3RleHQ+PC9zdmc+'}
            alt={payslip.title || '給与明細'}
            className="detail-image"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lj5HpgIHmlofnq6A8L3RleHQ+PC9zdmc+';
            }}
          />
        </div>
        
        <div className="detail-actions">
          <a 
            href={payslip.webContentLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="action-button share-button"
          >
            <Upload size={16} className="action-icon" />
            <span>Google Driveで開く</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default App;