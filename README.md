# UmayTerm

Modern ve güvenlik odaklı SSH terminal istemcisi. Tauri 2 + Rust (russh) + React + xterm.js ile geliştirilmiştir.

UmayTerm, bir sunucu yöneticisinin günlük işlerini tek pencerede toplar: SSH bağlantıları, host yönetimi, tüneller, SFTP dosya transferleri, snippet'ler ve yerel shell — hepsi sekmeli, bölünebilir ve kilitlenebilir bir arayüzde.

## Özellikler

### SSH ve Bağlantı
- **Kimlik doğrulama seçenekleri:** parola, anahtar dosyası (parolalı dahil), ssh-agent
- **Host key doğrulama:** ilk bağlantıda parmak izi onayı, değişen anahtar uyarısı, güvenilir anahtarların kalıcı kaydı
- **ProxyJump:** bastion/jump sunucu üzerinden zincirleme bağlantı (parola ile)
- **Yerel sekmeler:** zsh oturumları, Shift+tık ile başlangıç dizini seçimi
- **Tüneller:** yerel/uzak port yönlendirme (SSH kanalı üzerinden)
- **Keep-alive** ayarı

### Host Yönetimi
- Kaydet / düzenle (✎) / sil, gruplar, **etiketler** (tags), canlı arama
- Şifreler asla veritabanında değil — sistem keyring'inde saklanır
- **Veri taşıma:** host listesini dışa/içe aktar (JSON), `~/.ssh/config` içe aktar (Host/HostName/User/Port/IdentityFile)
- Export edilen dosyalar şifre içermez

### SFTP
- Çift yönlü dosya transferi, sürüklemeden bağımsız panel
- **Akışlı indirme/yükleme** — 8 MB parça sınırı, canlı ilerleme çubuğu, iptal desteği
- İndirme için "kaydet" ve yükleme için "dosya seç" diyalogları

### Arayüz
- Sekmeler: yeniden adlandırma, renk, sürükle-bırak sıralama, **kopyalama**, `Ctrl+Tab` / `Ctrl+1..9`
- **Split view:** dikey/yatay bölünmüş paneller
- **Komut paleti** (`Ctrl+P`): host, snippet ve komut arama
- **Broadcast** (📢): yazılan komutu tüm canlı sekmelere gönder
- Snippet'ler, arama (`Ctrl+Shift+F`), Unicode 11 desteği
- **F11** tam ekran, tema desteği

### Güvenlik ve Bakım
- **Uygulama kilidi:** argon2 ile parola karması, kilitliyken hostlar hafızadan düşürülür
- **Otomatik güncelleme:** imzalı AppImage güncellemeleri (tauri-plugin-updater)
- **Oturum kurtarma:** sekmeler kapanışta kaydedilir, açılışta geri yüklenir
- Otomatik zaman aşımı, kısayol guard'ları

## Kurulum

Gereksinim: `zsh` (yerel sekmeler için), Linux + X11/Wayland.

| Paket | Açıklama |
| --- | --- |
| `.deb` | Debian/Ubuntu tabanlı dağıtımlar — `sudo apt install ./UmayTerm_0.24.0_amd64.deb` |
| `.AppImage` | Taşınabilir — `chmod +x` ve çalıştır |

> **Not:** Otomatik güncelleme yalnızca AppImage paketinde çalışır. Güncellemeler `https://updates.umayterm.app/update.json` adresinden alınır (dağıtımda değiştirilebilir).

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

Frontend: `npm run dev` (yalnızca vite), kontrol: `npm run build` (tsc + vite). Rust tarafı: `src-tauri` içinde `cargo check`.

### Sürüm paketleme

```bash
npm run build
npm run tauri build          # deb + AppImage
```

**İmzalı sürüm akışı** (otomatik güncelleme için):

```bash
export TAURI_SIGNING_PRIVATE_KEY=/home/opade/.tauri/umayterm.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=umayterm-sign-key
npm run tauri build
VERSION=0.24.0 NOTES="Sürüm notları" ./release/make-update-json.sh
```

- İmza anahtarı üretimi: `npx tauri signer generate -w /path/to/key`; açık anahtar `tauri.conf.json > plugins.updater.pubkey` içine gömülür
- Manifest (`release/update.json`) imzalı bundle ile birlikte güncelleme sunucusuna yüklenir
- Dikkat: `npx tauri signer sign -f <keyfile> -p <password> <bundle>` (bayraklar `-f`/`-p`, `-k` değil)

### Sürüm politikası

Sürüm numarası 3 dosyada senkron tutulur: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.

### Mimari

```
src/                      React frontend (TypeScript + zustand)
  store.ts                Global state: sekmeler, hostlar, kilit, güncelleme, toast
  components/             TerminalView, Sidebar, ConnectModal, SftpPanel,
                          TunnelsPanel, SettingsDrawer, LockScreen, PaletteModal...
  styles/app.css          Tek stil dosyası
src-tauri/                Rust backend (Tauri 2)
  src/pty.rs              Yerel zsh oturumları (open_pty/close_pty, cwd desteği)
  src/ssh.rs              russh istemcisi: bağlantı, auth, host key, ProxyJump
  src/tunnels.rs          Port yönlendirme (L/R) + oturum bazlı temizlik
  src/sftp.rs             Akışlı transferler, ilerleme olayları, 8 MB parça sınırı
  src/store.rs            SQLite (hostlar, snippetler, host anahtarları, ayarlar),
                          keyring entegrasyonu, veri içe/dışa aktarma, uygulama kilidi
  src/lib.rs              Komut kayıtları ve plugin kurulumu
```

**Veri modeli:**
- `umayterm.db` (SQLite, rusqlite bundled): hostlar, snippetler, güvenilir host anahtarları, ayarlar, kilit karması. Dosya izni `0600`, dizin `0700`
- Şifreler/parolalar keyring'de saklanır (zbus secret-service) — veritabanında yalnızca boş alan
- Şema değişiklikleri idempotent migrasyon fonksiyonlarıyla yapılır (örn. `migrate_jump_columns`)
- Oturum kaydı `sessions.json` (izni `0600`), şifre içermez

**Güvenlik tasarımı:**
- CSP: `object-src 'none'`, `base-uri 'none'` dahil sıkı politika
- Parola alanlarında `autocomplete="new-password"`, dışa aktarımda şifreler atılır
- SSH verisi uygulama içinde doğrudan işlenir; tüneller kanal üzerinden açılır
- Kilit aktifken host parolaları hafızadan silinir

## Sürüm Geçmişi

| Sürüm | İçerik |
| --- | --- |
| v0.15.0 | Güvenlik sertleştirme: mosh bağımlılığı kaldırıldı, CSP, dosya izinleri, link protokol kısıtı |
| v0.16.0 | Uygulama kilidi (argon2) |
| v0.17.0 | Broadcast |
| v0.18.0 | Host dışa/içe aktarma, `~/.ssh/config` içe aktarma |
| v0.19.0 | Otomatik güncelleme (imzalı, tauri-plugin-updater) |
| v0.20.0 | Kararlılık: tünel/zombi temizliği, SSH yarış düzeltmeleri, toast sistemi, hata yayılımı |
| v0.21.0 | SFTP akışlı transfer + ilerleme çubuğu + dosya diyalogları |
| v0.22.0 | Host düzenleme, etiketler, yerel sekme başlangıç dizini |
| v0.23.0 | Jump host (ProxyJump), F11 tam ekran, sekmeyi kopyalama |
| v0.24.0 | Güvenlik sertleştirme: host key race condition, shell injection, Argon2 CSPRNG, şifre sızıntısı engelleme, mutex poisoning, ssh_config genişletme, snippet düzenleme, host silme onayı |

## Lisans

MIT — detaylar için `LICENSE` dosyasına bakın.