// MIT. Read-only cursor/window sampling for the user-selected capture window.
// No hooks, keyboard input, screenshots, file writes or network access.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

class CursorHelper {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct CursorInfo { public int Size, Flags; public IntPtr Cursor; public Point Position; }
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool GetPhysicalCursorPos(out Point point);
    [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CursorInfo info);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
    static volatile bool stopping;
    static string Number(double value) { return value.ToString("0.######", CultureInfo.InvariantCulture); }
    static void Main(string[] args) {
        long handle;
        if (args.Length != 2 || !long.TryParse(args[0], out handle) || handle <= 0 || (args[1] != "client" && args[1] != "frame")) return;
        var window = new IntPtr(handle);
        SetThreadDpiAwarenessContext(new IntPtr(-4)); // Physical pixels on mixed-DPI displays.
        uint owner; var thread = GetWindowThreadProcessId(window, out owner);
        if (!IsWindow(window) || thread == 0) return;
        Process ownerProcess;
        try { ownerProcess = Process.GetProcessById((int)owner); } catch { return; }
        var input = new Thread(() => { Console.ReadLine(); stopping = true; });
        input.IsBackground = true; input.Start(); // EOF also stops sampling if the parent exits.
        var clock = Stopwatch.StartNew();
        try {
            while (!stopping && clock.Elapsed.TotalSeconds < 150) {
                uint currentOwner;
                if (ownerProcess.HasExited || !IsWindow(window) || GetWindowThreadProcessId(window, out currentOwner) != thread || currentOwner != owner) {
                    Console.WriteLine("{\"error\":\"window-closed\"}"); break;
                }
                Rect rect = new Rect(); Point point = new Point();
                var cursor = new CursorInfo { Size = Marshal.SizeOf(typeof(CursorInfo)) };
                bool boundsValid = !IsIconic(window) && DwmGetWindowAttribute(window, 9, out rect, Marshal.SizeOf(typeof(Rect))) == 0;
                // Electron/Chromium's in-process Aura capture excludes the non-client title bar.
                if (boundsValid && args[1] == "client") {
                    Rect client; var origin = new Point();
                    boundsValid = GetClientRect(window, out client) && ClientToScreen(window, ref origin);
                    if (boundsValid) rect = new Rect { Left = origin.X, Top = origin.Y, Right = origin.X + client.Right, Bottom = origin.Y + client.Bottom };
                }
                if (!boundsValid) rect = new Rect();
                bool visible = boundsValid && GetPhysicalCursorPos(out point);
                if (!visible) point = new Point();
                visible = visible && GetCursorInfo(ref cursor) && (cursor.Flags & 1) != 0 && GetAncestor(WindowFromPoint(point), 2) == window;
                string bounds = boundsValid ? "{\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + (rect.Right-rect.Left) + ",\"height\":" + (rect.Bottom-rect.Top) + "}" : "null";
                string position = visible ? "{\"x\":" + point.X + ",\"y\":" + point.Y + "}" : "null";
                Console.WriteLine("{\"elapsed\":" + Number(clock.Elapsed.TotalMilliseconds) + ",\"point\":" + position + ",\"bounds\":" + bounds + "}");
                Console.Out.Flush(); Thread.Sleep(33);
            }
        } catch (System.IO.IOException) { } finally { ownerProcess.Dispose(); }
    }
}
