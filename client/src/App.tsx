import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ensureSession } from "./session.ts";
import { syncPushSubscription } from "./push.ts";
import { AdminDoor } from "./pages/AdminDoor.tsx";
import { AuthPage } from "./pages/Auth.tsx";
import { ForgotPassword } from "./pages/ForgotPassword.tsx";
import { Landing } from "./pages/Landing.tsx";
import { Lobby } from "./pages/Lobby.tsx";
import { People } from "./pages/People.tsx";
import { PersonProfile } from "./pages/PersonProfile.tsx";
import { Play } from "./pages/Play.tsx";
import { Profile } from "./pages/Profile.tsx";
import { RequestAccess } from "./pages/RequestAccess.tsx";
import { RoomLobby } from "./pages/RoomLobby.tsx";
import { Signup } from "./pages/Signup.tsx";

function Guard({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void ensureSession().then((s) => {
      if (!live) return;
      if (s) void syncPushSubscription();
      setOk(Boolean(s));
    });
    return () => {
      live = false;
    };
  }, []);
  if (ok === null) return null;
  return ok ? children : <Navigate to="/login" replace />;
}

function SwNav() {
  const nav = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === "baithak-nav" && typeof event.data.url === "string") {
        nav(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [nav]);
  return null;
}

export default function App() {
  return (
    <div className="app-bg">
      <div className="grain" />
      <SwNav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/register" element={<Navigate to="/request-access" replace />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/errorPagesBro" element={<AdminDoor />} />
        <Route
          path="/lobby"
          element={
            <Guard>
              <Lobby />
            </Guard>
          }
        />
        <Route
          path="/people"
          element={
            <Guard>
              <People />
            </Guard>
          }
        />
        <Route
          path="/people/:id"
          element={
            <Guard>
              <PersonProfile />
            </Guard>
          }
        />
        <Route
          path="/profile"
          element={
            <Guard>
              <Profile />
            </Guard>
          }
        />
        <Route
          path="/table/:id"
          element={
            <Guard>
              <RoomLobby />
            </Guard>
          }
        />
        <Route
          path="/play/:id"
          element={
            <Guard>
              <Play />
            </Guard>
          }
        />
      </Routes>
    </div>
  );
}
