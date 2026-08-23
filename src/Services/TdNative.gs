package Tgtui

import System
import System.Runtime.InteropServices

@DllImport("tdjson", EntryPoint: "td_create_client_id", CallingConvention: CallingConvention.Cdecl)
func tdCreateClientId() int32;

@DllImport("tdjson", EntryPoint: "td_send", CallingConvention: CallingConvention.Cdecl)
func tdSendNative(clientId int32, request nint);

@DllImport("tdjson", EntryPoint: "td_receive", CallingConvention: CallingConvention.Cdecl)
func tdReceive(timeout float64) nint;

@DllImport("tdjson", EntryPoint: "td_execute", CallingConvention: CallingConvention.Cdecl)
func tdExecuteNative(request nint) nint;

internal func tdSend(clientId int32, request string) {
  let pointer = Marshal.StringToCoTaskMemUTF8(request)
  defer Marshal.FreeCoTaskMem(pointer)
  tdSendNative(clientId, pointer)
}

internal func tdExecute(request string) nint {
  let pointer = Marshal.StringToCoTaskMemUTF8(request)
  defer Marshal.FreeCoTaskMem(pointer)
  return tdExecuteNative(pointer)
}

internal func tdRead(pointer nint) string {
  if pointer == 0 { return "" }
  return Marshal.PtrToStringUTF8(pointer) ?? ""
}
