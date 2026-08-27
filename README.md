<p align="center">
  <img src="src-tauri/icons/umayterm.svg" alt="UmayTerm" width="140" />
</p>

<h1 align="center">UmayTerm</h1>

<p align="center">
  <b>Modern ve güvenlik odaklı SSH terminal istemcisi</b><br />
  Tauri 2 · Rust (russh) · React · xterm.js
</p>

<p align="center">
  <a href="#kurulum">Kurulum</a> ·
  <a href="#özellikler">Özellikler</a> ·
  <a href="#kullanım">Kullanım</a> ·
  <a href="#yapay-zeka">Yapay Zeka</a> ·
  <a href="#güvenlik">Güvenlik</a> ·
  <a href="#geliştirici">Geliştirici</a>
</p>

---

UmayTerm, bir sunucu yöneticisinin günlük işlerini tek pencerede toplar: SSH bağlantıları, host yönetimi, tüneller, SFTP dosya transferleri, snippet'ler, yerel shell ve yapay zeka destekli asistanlar — hepsi sekmeli, bölünebilir ve kilitlenebilir bir arayüzde.

---

## Kurulum

### Gereksinimler

- **Linux** (X11/Wayland)
- `zsh` (yerel sekmeler için) — `sudo apt install zsh`
- SSH anahtar üretimi için `ssh-keygen` (OpenSSH ile gelir)

### Yöntem 1: .deb paketi (Debian/Ubuntu tabanlı)

```bash
sudo apt install ./UmayTerm_0.28.0_amd64.deb
# Uygulamayı başlat
umayterm
```

### Yöntem 2: AppImage (taşınabilir)

```bash
chmod +x UmayTerm_0.28.0_amd64.AppImage
./UmayTerm_0.28.0_amd64.AppImage
```

> **Not:** Otomatik güncelleme yalnızca AppImage paketinde çalışır. Güncellemeler `https://updates.umayterm.app/update.json` adresinden alınır.

### İlk adım

1. Uygulama açılınca varsayılan olarak bir **yerel zsh sekmesi** oluşur.
2. Sol taraftaki **Hostlar** listesinden veya üstteki **🔌 SSH Bağlan** butonundan ilk bağlantınızı kurun.
3. İsterseniz **✨** (AI Asistan) için bir OpenRouter anahtarı tanımlayın.

---

## Özellikler

### SSH ve Bağlantı

- **Kimlik doğrulama:** parola, anahtar dosyası (parolalı dahil), ssh-agent
- **Host key doğrulama:** ilk bağlantıda parmak izi onayı, değişen anahtar uyarısı, güvenilir anahtarların kalıcı kaydı
- **ProxyJump:** bastion/jump sunucu üzerinden zincirleme bağlantı (parola ile)
- **SSH anahtar üretici:** `🔑 Yeni anahtar oluştur` ile doğrudan arayüzden ed25519 anahtar üretin (yol + opsiyonel parola), anahtar otomatik bağlantı alanına yazılır
- **Bağlanınca otomatik komut:** host başına tanımlı `startupCommand` bağlantı kurulur kurulmaz çalıştırılır (ör. `cd /var/www && git status`)
- **Keep-alive** ayarı, otomatik zaman aşımı

### Host Yönetimi

- Kaydet / düzenle (✎) / sil, **gruplar**, **etiketler (tags)**, canlı arama
- Şifreler asla veritabanında değil — **sistem keyring**'inde saklanır
- **Hızlı eylem menüsü:** host'a sağ tıklayın veya `⋯` butonuna basın → Bağlan, **SSH komutunu kopyala**, SFTP / Tünel (aktif bağlantı varsa), Düzenle, Sil
- **Veri taşıma:** host listesini dışa/içe aktar (JSON), `~/.ssh/config` içe aktar, hostları `~/.ssh/config.umayterm` dosyasına **dışa aktar** (İçinde `Include` önerisi bulunur)
- Export edilen dosyalar şifre içermez

### Yerel Sekmeler ve Terminal

- zsh oturumları, `Shift+tık` ile başlangıç dizini seçimi
- **Sekme renklendirme, yeniden adlandırma, kopyalama**, sürükle-bırak sıralama, `Ctrl+Tab` / `Ctrl+1..9`
- **Salt-okunur sekme:** sekme menüsünden `🔒 Salt-okunur yap` — giriş tamamen engellenir (yanlışlıkla yazmayı önler)
- **Split view:** dikey/yatay bölünmüş paneller (2, 3 veya 4 bölme)
- **Shell entegrasyonu:** çalışılan dizin sekme başlığında gösterilir (üzerine gelince tam yol); **5 saniyeden uzun süren komutlar bitince** ekranda bildirim çıkar
- **Oturum kaydı:** sekme menüsünden `📝 Oturumu kaydet` — tüm çıktı `~/.local/share/com.opade.umayterm/session-logs/` altına yazılır
- Arama (`Ctrl+Shift+F`), Unicode 11 desteği, `F11` tam ekran, tema desteği
- **Broadcast (📢):** yazılan komut tüm canlı sekmelere gönderilir
- **Sistem durumu:** her sekmede açılabilen CPU / RAM / disk paneli — hem SSH (uzak makine) hem yerel sekmeler için

### Komut Paleti (`Ctrl+P`)

Tüm komutları tek yerden arayın ve çalıştırın:

- **Eylemler:** SSH Bağlan, Yeni yerel sekme, Ayarlar
- **Sekmeler:** açık sekmeler arasında hızlı geçiş
- **Hostlar:** kayıtlı sunuculara bağlanma
- **Snippetler:** kayıtlı komutlar
- **Dev Kurulumları:** geliştirici kurulum komutları (aşağıya bakın)

> `Ctrl+P` terminal odaklıyken de çalışır.

### Dev Kurulumları

Geliştiricilerin ihtiyaç duyduğu hazır kurulum komutları — palette'te "Dev Kurulumları" grubundan seçin, komut aktif terminale yazılır (yer tutucuları düzenleyip `Enter`'a siz basarsınız):

| Komut | Açıklama |
|---|---|
| `laravel new <proje>` | Laravel projesi |
| `composer create-project laravel/laravel <proje>` | Laravel (Composer) |
| `npm create vite@latest <proje>` | Vite |
| `npx create-next-app@latest <proje>` | Next.js |
| `npx create-react-app <proje>` | React (CRA) |
| `npm create vue@latest <proje>` | Vue |
| `npx create-expo-app@latest <proje>` | Expo / React Native |
| `npm create astro@latest` | Astro |
| `npm init -y` | Boş Node projesi |
| `npm install -g pnpm` | pnpm |
| `curl -fsSL https://bun.sh/install \| bash` | Bun |
| nvm kurulum scripti | Node Version Manager |
| rustup kurulum scripti | Rust |
| Oh My Zsh kurulum scripti | zsh tema/plugin |
| `curl -fsSL https://get.docker.com \| sudo sh` | Docker Engine |
| `sudo apt install ... postgresql` | PostgreSQL |
| `sudo apt install ... mysql-server` | MySQL |

### Snippet'ler

- Sidebar'dan kaydedin, düzenleyin, tıklayınca aktif terminale yazılır
- **Yer tutucu desteği:** `${1}`, `${2}`... — çalıştırınca imleç otomatik ilk yer tutucuya konur
- **Yedekleme:** Ayarlar > Veri'den snippet JSON dışa/içe aktar

### SFTP

- Çift yönlü dosya transferi; sürükleyip bağımsız panel
- **Akışlı transfer + ilerleme çubuğu + iptal** desteği
- **Kesintiye devam (resume):** yarıda kalan indirme/yükleme otomatik devam ettirilir (kısmi dosya algılanır)
- **Transfer kuyruğu:** birden fazla dosya seçin, sırayla yüklenir
- Dizin oluşturma, dosya oluşturma, yeniden adlandırma, silme

### Tüneller

- Yerel / uzak / SOCKS5 port yönlendirme (SSH kanalı üzerinden)
- Oturum kapanınca otomatik temizlik

### Yapay Zeka

- **AI Asistan (✨):** OpenRouter üzerinden sohbet. API anahtarı güvenli şekilde keyring'de saklanır. Yanıtlar **markdown olarak görüntülenir**; kod bloklarında **Kopyala** butonu bulunur.
- **AI Terminal Asistanı:** terminalde bir hata/çıktı seçin → sağ tık → `🤖 Seçimi AI'ya gönder` — seçim açıklama/çözüm isteğiyle AI Asistan'a gider ve yanıt otomatik alınır.
- **opencode paneli (🧠):** sekmede `opencode` (TUI) çalışıyorsa sağ panelde **subagent ağacı** ve **canlı işlem akışı** görüntülenir (tool çağrıları, düşünme, durum rozetleri). Panel `~/.local/share/opencode/opencode.db` veritabanını salt-okunur izler.

### Arayüz ve Ayarlar

- **Tema** seçimi, **font** ailesi/boyutu, satır yüksekliği, scrollback
- **Aksan rengi:** 7 hazır renk veya özel renk seçici — tüm vurgular anında değişir
- **Dil:** Türkçe / English
- **Oturum kurtarma:** sekmeler kapanışta kaydedilir, açılışta geri yüklenir
- **Pencere başlığı** sürüm bilgisi içerir (örn. `UmayTerm 0.28.0`)

---

## Kullanım

### Klavye kısayolları

| Kısayol | İşlev |
|---|---|
| `Ctrl+T` | Yeni yerel sekme |
| `Ctrl+P` | Komut paleti |
| `Ctrl+Tab` / `Ctrl+1..9` | Sekme geçişi |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Terminalde kopyala / yapıştır |
| `Ctrl+Shift+F` | Terminal içinde arama |
| `Ctrl+W` | Aktif sekmeyi kapat (terminale gönderilmez) |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Yazı boyutu yakınlaştır / uzaklaştır / sıfırla |
| `F11` | Tam ekran |
| `Esc` | Panel / arama kapat |

### Sekme menüsü (sağ tık)

Her sekmede sağ tık: **renk seç / kaldır**, **yeniden adlandır**, **salt-okunur yap**, **oturumu kaydet** (yerel), **sekmeyi kopyala**, **sekmeyi kapat**.

### Terminal menüsü (sağ tık)

Terminalde sağ tık: **Kopyala**, **Yapıştır**, **Tümünü seç**, **🤖 Seçimi AI'ya gönder**, SSH oturumu öldüyse **⟳ Yeniden Bağlan**.

---

## Güvenlik

- **Uygulama kilidi:** argon2 ile parola karması; kilitliyken hostlar hafızadan düşürülür, kayıtlı bağlantılar gizlenir. Ayarlar > Uygulama kilidi'nden parola belirleyin/değiştirin/kaldırın; 🔒 butonuyla anında kilitleyin.
- Şifreler ve parolalar **keyring**'de saklanır — veritabanında yalnızca boş alan.
- CSP `object-src 'none'`, `base-uri 'none'` dahil sıkı politika.
- Oturum kayıtları `0600` dosya izniyle yazılır.
- Dışa aktarılan yedekler şifre içermez.

---

## Geliştirici

### Gereksinimler

- Node.js 20+ ve npm
- Rust (stable) + Cargo
- Tauri 2 Linux bağımlılıkları: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `build-essential`, `libssl-dev`, `pkg-config`
- `npx tauri` (CLI, paketle birlikte gelir)

### Geliştirme

```bash
npm install
npm run tauri dev
```

Frontend: `npm run dev` (yalnızca vite) · kontrol: `npm run build` (tsc + vite) · Rust: `src-tauri` içinde `cargo check`.

### Sürüm paketleme

```bash
npm run build
npm run tauri build          # deb + AppImage
```

**İmzalı sürüm akışı** (otomatik güncelleme için):

```bash
export TAURI_SIGNING_PRIVATE_KEY=/path/to/umayterm.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=umayterm-sign-key
npm run tauri build
VERSION=0.28.0 NOTES="Sürüm notları" ./release/make-update-json.sh
```

- Manifest (`release/update.json`) imzalı bundle ile birlikte güncelleme sunucusuna yüklenir.
- Sürüm numarası 3 dosyada senkron tutulur: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.

### Mimari

```
src/                      React frontend (TypeScript + zustand)
  store.ts                Global state: sekmeler, hostlar, kilit, güncelleme, toast
  i18n.ts                 Dil katmanı (TR/EN)
  devCommands.ts          Geliştirici kurulum komutları kütüphanesi
  components/             TerminalView, Sidebar, SftpPanel, AiDrawer, OpencodePanel,
                          ConnectModal, SettingsDrawer, LockScreen, PaletteModal...
  styles/                 app.css (tek stil), terminal.css
src-tauri/                Rust backend (Tauri 2)
  src/pty.rs              Yerel zsh oturumları, OSC 7/9 shell entegrasyonu, oturum
                          kaydı, yerel sistem istatistikleri
  src/ssh.rs              russh istemcisi, host key, ProxyJump, ssh_keygen
  src/sftp.rs             Akışlı transferler, resume, kuyruk
  src/tunnels.rs          Port yönlendirme
  src/ai.rs               OpenRouter sohbet (SSE akışı)
  src/opencode.rs         opencode.db salt-okunur izleyici (subagent ağacı)
  src/store.rs            SQLite, keyring, içe/dışa aktarma, uygulama kilidi
```

**Veri modeli:**
- `umayterm.db` (SQLite, rusqlite bundled): hostlar, snippet'ler, güvenilir host anahtarları, ayarlar, kilit karması. Dosya izni `0600`, dizin `0700`
- Şifreler keyring'de (zbus secret-service); şema değişiklikleri idempotent migrasyonlarla yapılır
- Oturum kaydı `sessions.json` (izni `0600`), şifre içermez

---

## Lisans

MIT — detaylar için `LICENSE` dosyasına bakın.