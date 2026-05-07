import { Routes, Route, Navigate } from "react-router-dom";
import MainMenu from "./components/screens/MainMenu";
import MatchScreen from "./components/screens/MatchScreen";
import HeroSelect from "./components/screens/HeroSelect";
import HowToPlay from "./components/screens/HowToPlay";
import Settings from "./components/screens/Settings";
import DevTokens from "./components/screens/DevTokens";
import DevComponents from "./components/screens/DevComponents";
import { Choreographer } from "./components/effects/Choreographer";

export default function App() {
  return (
    <Choreographer>
      <Routes>
        <Route path="/"               element={<MainMenu />} />
        <Route path="/heroes"         element={<HeroSelect />} />
        <Route path="/play"           element={<MatchScreen />} />
        <Route path="/how-to-play"    element={<HowToPlay />} />
        <Route path="/settings"       element={<Settings />} />
        <Route path="/dev/tokens"     element={<DevTokens />} />
        <Route path="/dev/components" element={<DevComponents />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </Choreographer>
  );
}
