# Aiuti per il collaudo: stato della finestra AGENT TOWER, finestra in primo piano, scorciatoia, spostamento.
# Uso: powershell -File scripts/finestra-win.ps1 -Azione stato|premi-scorciatoia|sposta -X 100 -Y 100
param([string]$Azione = "stato", [int]$X = 0, [int]$Y = 0)
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class Fin {
  public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
[Fin]::SetProcessDPIAware() | Out-Null
$h = [Fin]::FindWindow([NullString]::Value, "AGENT TOWER")
function Titolo($w) { $sb = New-Object System.Text.StringBuilder 200; [Fin]::GetWindowText($w, $sb, 200) | Out-Null; $sb.ToString() }
switch ($Azione) {
  "stato" {
    $r = New-Object Fin+RECT; [Fin]::GetWindowRect($h, [ref]$r) | Out-Null
    $top = ([Fin]::GetWindowLong($h, -20) -band 0x8) -ne 0   # WS_EX_TOPMOST
    "visibile=$([Fin]::IsWindowVisible($h)) sempre-sopra=$top rett=($($r.L),$($r.T))-($($r.R),$($r.B)) primo-piano='$(Titolo ([Fin]::GetForegroundWindow()))'"
  }
  "premi-scorciatoia" {
    # Ctrl+Alt+A premuti davvero come da tastiera
    [Fin]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); [Fin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Fin]::keybd_event(0x41, 0, 0, [UIntPtr]::Zero)
    [Fin]::keybd_event(0x41, 0, 2, [UIntPtr]::Zero); [Fin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); [Fin]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
    "premuto Ctrl+Alt+A"
  }
  "sposta" { [Fin]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, 0, 0, 0x0001 -bor 0x0004 -bor 0x0010) | Out-Null; "spostata a $X,$Y" }  # NOSIZE|NOZORDER|NOACTIVATE
}
