import { Routes, Route } from "react-router-dom";
import { useMagneticRipple } from "./lib/ripple";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import TestPage from "./pages/TestPage";
import WrongBookPage from "./pages/WrongBookPage";
import WordsPage from "./pages/WordsPage";
import MemosPage from "./pages/MemosPage";

export default function App() {
  useMagneticRipple();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/wrong-book" element={<WrongBookPage />} />
        <Route path="/words" element={<WordsPage />} />
        <Route path="/memos" element={<MemosPage />} />
        <Route
          path="*"
          element={
            <div className="pt-20 text-center text-[#9a9a9a]">页面不存在</div>
          }
        />
      </Route>
    </Routes>
  );
}
