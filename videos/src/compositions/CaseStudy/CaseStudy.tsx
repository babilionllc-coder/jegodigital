import { AbsoluteFill, Series, Audio, staticFile } from "remotion";
import React from "react";
import { SceneIntro } from "./SceneIntro";
import { SceneImages } from "./SceneImages";
import { SceneVideos } from "./SceneVideos";
import { SceneOutro } from "./SceneOutro";

export const CaseStudy: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            <Audio src={staticFile("assets/style_vo.mp3")} volume={0.5} />
            <Series>
                <Series.Sequence durationInFrames={120}>
                    <SceneIntro />
                </Series.Sequence>
                <Series.Sequence durationInFrames={180}>
                    <SceneImages />
                </Series.Sequence>
                <Series.Sequence durationInFrames={180}>
                    <SceneVideos />
                </Series.Sequence>
                <Series.Sequence durationInFrames={120}>
                    <SceneOutro />
                </Series.Sequence>
            </Series>
        </AbsoluteFill>
    );
};
