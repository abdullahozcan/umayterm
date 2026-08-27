export interface DevCommand {
  key: string;
  title: string;
  subtitle: string;
  command: string;
  icon: string;
  hasPlaceholder?: boolean;
}

export const DEV_COMMANDS: DevCommand[] = [
  {
    key: "laravel",
    title: "Laravel",
    subtitle: "Laravel projesi oluştur",
    command: "laravel new <proje>",
    icon: "🛠",
    hasPlaceholder: true,
  },
  {
    key: "laravel-composer",
    title: "Laravel (Composer)",
    subtitle: "Composer ile Laravel projesi",
    command: "composer create-project laravel/laravel <proje>",
    icon: "🛠",
    hasPlaceholder: true,
  },
  {
    key: "vite",
    title: "Vite",
    subtitle: "Vite tabanlı frontend projesi",
    command: "npm create vite@latest <proje>",
    icon: "⚡",
    hasPlaceholder: true,
  },
  {
    key: "nextjs",
    title: "Next.js",
    subtitle: "React metaframework projesi",
    command: "npx create-next-app@latest <proje>",
    icon: "▲",
    hasPlaceholder: true,
  },
  {
    key: "react",
    title: "React (CRA)",
    subtitle: "Create React App projesi",
    command: "npx create-react-app <proje>",
    icon: "⚛",
    hasPlaceholder: true,
  },
  {
    key: "vue",
    title: "Vue",
    subtitle: "Vue projesi",
    command: "npm create vue@latest <proje>",
    icon: "💚",
    hasPlaceholder: true,
  },
  {
    key: "expo",
    title: "Expo (React Native)",
    subtitle: "Mobil React Native projesi",
    command: "npx create-expo-app@latest <proje>",
    icon: "📱",
    hasPlaceholder: true,
  },
  {
    key: "astro",
    title: "Astro",
    subtitle: "Astro site projesi",
    command: "npm create astro@latest",
    icon: "🚀",
  },
  {
    key: "npm-init",
    title: "npm init",
    subtitle: "Boş Node projesi başlat",
    command: "npm init -y",
    icon: "📦",
  },
  {
    key: "pnpm",
    title: "pnpm",
    subtitle: "pnpm paket yöneticisini kur",
    command: "npm install -g pnpm",
    icon: "⚡",
  },
  {
    key: "bun",
    title: "Bun",
    subtitle: "Bun runtime'ı kur",
    command: "curl -fsSL https://bun.sh/install | bash",
    icon: "🥟",
  },
  {
    key: "nvm",
    title: "nvm + Node",
    subtitle: "Node Version Manager kur",
    command:
      "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
    icon: "🟢",
  },
  {
    key: "rust",
    title: "Rust (rustup)",
    subtitle: "Rust araç zincirini kur",
    command:
      "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    icon: "🦀",
  },
  {
    key: "ohmyzsh",
    title: "Oh My Zsh",
    subtitle: "zsh tema ve eklenti yapısı",
    command:
      "sh -c \"$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)\"",
    icon: "💻",
  },
  {
    key: "docker",
    title: "Docker Engine",
    subtitle: "Resmi kurulum scripti ile Docker",
    command: "curl -fsSL https://get.docker.com | sudo sh",
    icon: "🐳",
  },
  {
    key: "postgresql",
    title: "PostgreSQL",
    subtitle: "apt ile PostgreSQL kur",
    command: "sudo apt update && sudo apt install -y postgresql postgresql-contrib",
    icon: "🐘",
  },
  {
    key: "mysql",
    title: "MySQL",
    subtitle: "apt ile MySQL Server kur",
    command: "sudo apt update && sudo apt install -y mysql-server",
    icon: "🗄",
  },
];