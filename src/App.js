// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { Camera, List, FileText, Upload, Search, ArrowLeft } from 'lucide-react';
import './App.css'; // 通常のCSSファイルを使用

// 環境変数からAPIキーとクライアントIDを取得
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// Google Drive APIのスコープ
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// メインアプリケーション
function App() {
  const [view, setView] = useState('home'); // home, camera, list, detail
  const [payslips, setPayslips] = useState([]);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stream, setStream] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const videoRef = useRef(null);

  // Google APIのロード
  useEffect(() => {
    const loadGoogleApi = async () => {
      try {
        // Google API Client Libraryをロード
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });

        // Google APIの初期化
        await new Promise((resolve) => gapi.load('client:auth2', resolve));
        await gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          scope: SCOPES,
        });

        setIsGoogleApiLoaded(true);
      } catch (error) {
        console.error('Google APIのロードに失敗しました:', error);
      }
    };

    loadGoogleApi();
  }, []);

  // カメラストリームのクリーンアップ
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Google Driveにファイルをアップロード
  const uploadToGoogleDrive = async (imageData) => {
    try {
      setIsUploading(true);

      // 認証状態を確認
      if (!gapi.auth2.getAuthInstance().isSignedIn.get()) {
        await gapi.auth2.getAuthInstance().signIn();
      }

      // 画像データをBlobに変換
      const byteString = atob(imageData.split(',')[1]);
      const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });

      // ファイル名を生成
      const fileName = `給与明細_${new Date().toISOString().slice(0, 10)}.jpg`;

      // メタデータを設定
      const metadata = {
        name: fileName,
        mimeType: mimeString,
        parents: ['root'], // ルートフォルダに保存
      };

      // マルチパートリクエストを作成
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      // ファイルをアップロード
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('アップロードに失敗しました');
      }

      const result = await response.json();
      return result.id; // アップロードされたファイルのIDを返す
    } catch (error) {
      console.error('Google Driveへのアップロードに失敗しました:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  // 写真を撮影する関数
  const capturePhoto = async () => {
    if (videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0);
        
        const imageUrl = canvas.toDataURL('image/jpeg');
        
        // Google Driveにアップロード
        const fileId = await uploadToGoogleDrive(imageUrl);
        
        const newPayslip = {
          id: Date.now(),
          date: new Date().toISOString().slice(0, 7),
          imageUrl: imageUrl,
          fileId: fileId,
          title: `${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}分給与明細`
        };
        
        setPayslips([...payslips, newPayslip]);
        alert('給与明細を保存しました！');
        setView('home');
      } catch (error) {
        alert('保存に失敗しました: ' + error.message);
      }
    }
  };

  // フィルター処理された給与明細リスト
  const filteredPayslips = payslips.filter(payslip => 
    payslip.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-content">
          {view !== 'home' && (
            <button 
              onClick={() => {
                if (stream) {
                  stream.getTracks().forEach(track => track.stop());
                  setStream(null);
                }
                setView('home');
              }} 
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
            onClick={() => setView('home')} 
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
  return (
    <div className="list-view">
      <div className="search-container">
        <input
          type="text"
          placeholder="給与明細を検索..."
          value={searchTerm}
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
          {payslips.map(payslip => (
            <li 
              key={payslip.id}
              onClick={() => onPayslipClick(payslip)}
              className="payslip-item"
            >
              <div className="payslip-thumbnail">
                <img 
                  src={payslip.imageUrl} 
                  alt={payslip.title} 
                  className="thumbnail-image"
                />
              </div>
              <div className="payslip-info">
                <h3 className="payslip-title">{payslip.title}</h3>
                <p className="payslip-date">保存日: {new Date(payslip.id).toLocaleDateString('ja-JP')}</p>
              </div>
            </li>
          ))}
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
        <h2 className="detail-title">{payslip.title}</h2>
        <p className="detail-date">保存日: {new Date(payslip.id).toLocaleDateString('ja-JP')}</p>
        
        <div className="detail-image-container">
          <img 
            src={payslip.imageUrl} 
            alt={payslip.title} 
            className="detail-image"
          />
        </div>
        
        <div className="detail-actions">
          <button className="action-button share-button">
            <Upload size={16} className="action-icon" />
            <span>共有</span>
          </button>
          
          <button className="action-button edit-button">
            <FileText size={16} className="action-icon" />
            <span>編集</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;