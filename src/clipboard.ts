import {
  readText as clipReadText,
  writeText as clipWriteText,
} from "@tauri-apps/plugin-clipboard-manager";

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await clipWriteText(text);
    return true;
  } catch {
    // eklenti kullanılamadı, web API'ye düş
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<string> {
  try {
    return await clipReadText();
  } catch {
    // eklenti kullanılamadı, web API'ye düş
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}