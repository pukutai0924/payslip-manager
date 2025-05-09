// GoogleDriveService.js
// Google Drive APIとの連携機能を提供するサービスクラス

class GoogleDriveService {
    constructor() {
      this.API_KEY = REACT_APP_GOOGLE_API_KEY; // YOUR_API_KEY
      this.CLIENT_ID = REACT_APP_GOOGLE_CLIENT_ID; // YOUR_CLIENT_ID
      this.DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
      this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
      this.isInitialized = false;
      this.authInstance = null;
    }
  
    /**
     * Google APIをロードして初期化する
     * @returns {Promise} - 初期化処理のPromise
     */
    loadGoogleApi() {
      return new Promise((resolve, reject) => {
        // すでに初期化済みの場合は何もしない
        if (this.isInitialized) {
          resolve();
          return;
        }
  
        // Google APIをロード
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          window.gapi.load('client:auth2', () => {
            this._initClient().then(resolve).catch(reject);
          });
        };
        script.onerror = (error) => {
          reject(new Error('Google APIのロードに失敗しました: ' + error));
        };
        document.body.appendChild(script);
      });
    }
  
    /**
     * Google APIクライアントを初期化する（内部メソッド）
     * @returns {Promise} - 初期化処理のPromise
     */
    _initClient() {
      return window.gapi.client.init({
        apiKey: this.API_KEY,
        clientId: this.CLIENT_ID,
        discoveryDocs: this.DISCOVERY_DOCS,
        scope: this.SCOPES
      }).then(() => {
        this.authInstance = window.gapi.auth2.getAuthInstance();
        this.isInitialized = true;
        console.log('Google APIクライアントの初期化が完了しました');
      });
    }
  
    /**
     * ユーザーのログイン状態を確認
     * @returns {boolean} - ログイン状態
     */
    isSignedIn() {
      if (!this.isInitialized) return false;
      return this.authInstance.isSignedIn.get();
    }
  
    /**
     * Google アカウントにログイン
     * @returns {Promise} - ログイン処理のPromise
     */
    signIn() {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      return this.authInstance.signIn();
    }
  
    /**
     * Google アカウントからログアウト
     * @returns {Promise} - ログアウト処理のPromise
     */
    signOut() {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      return this.authInstance.signOut();
    }
  
    /**
     * 給与明細の写真をGoogle Driveにアップロード
     * @param {string} imageData - Base64エンコードされた画像データ
     * @param {string} title - ファイル名（給与明細のタイトル）
     * @returns {Promise} - アップロード処理のPromise
     */
    uploadPayslipImage(imageData, title) {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      
      if (!this.isSignedIn()) {
        return Promise.reject(new Error('Google アカウントにログインしていません'));
      }
      
      // Base64データからBlobを作成
      const blob = this._base64ToBlob(imageData);
      
      // メタデータを設定
      const metadata = {
        name: `${title}.jpg`,
        mimeType: 'image/jpeg',
        // 特定のフォルダに保存する場合はparentsを指定
        // parents: ['FOLDER_ID']
      };
      
      // マルチパートリクエストを作成
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);
      
      // アップロードリクエストを送信
      return gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: {
          'Content-Type': 'multipart/related'
        },
        body: form
      }).then(response => {
        console.log('アップロード成功:', response);
        return response.result;
      });
    }
  
    /**
     * 給与明細一覧を取得
     * @returns {Promise} - 給与明細一覧の取得処理のPromise
     */
    listPayslips() {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      
      if (!this.isSignedIn()) {
        return Promise.reject(new Error('Google アカウントにログインしていません'));
      }
      
      return gapi.client.drive.files.list({
        // 「給与明細」という文字列を含むファイル名で、画像ファイルを検索
        q: "name contains '給与明細' and (mimeType='image/jpeg' or mimeType='image/png')",
        fields: 'files(id, name, createdTime, webViewLink, thumbnailLink)',
        orderBy: 'createdTime desc'
      }).then(response => {
        console.log('給与明細リスト取得:', response.result.files);
        return response.result.files;
      });
    }
  
    /**
     * 給与明細の詳細（実際の画像データ）を取得
     * @param {string} fileId - ファイルID
     * @returns {Promise} - ファイル詳細の取得処理のPromise
     */
    getPayslipFile(fileId) {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      
      if (!this.isSignedIn()) {
        return Promise.reject(new Error('Google アカウントにログインしていません'));
      }
      
      return gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }).then(response => {
        return response.body;
      });
    }
  
    /**
     * 給与明細を削除
     * @param {string} fileId - ファイルID
     * @returns {Promise} - ファイル削除処理のPromise
     */
    deletePayslip(fileId) {
      if (!this.isInitialized) {
        return Promise.reject(new Error('Google APIクライアントが初期化されていません'));
      }
      
      if (!this.isSignedIn()) {
        return Promise.reject(new Error('Google アカウントにログインしていません'));
      }
      
      return gapi.client.drive.files.delete({
        fileId: fileId
      });
    }
  
    /**
     * Base64エンコードされた画像データをBlobに変換（内部メソッド）
     * @param {string} dataURI - Base64エンコードされた画像データ
     * @returns {Blob} - 変換されたBlobオブジェクト
     */
    _base64ToBlob(dataURI) {
      // Base64のヘッダー部分を削除
      const byteString = atob(dataURI.split(',')[1]);
      const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
      
      // バイナリデータに変換
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      return new Blob([ab], { type: mimeString });
    }
  }
  
  export default new GoogleDriveService();