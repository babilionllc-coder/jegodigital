import { Series } from 'remotion';
import { LegacyProblemScene } from './LegacyProblemScene';
import { LiveScanScene } from './LiveScanScene';
import { AgentDemoScene } from './AgentDemoScene';
import { TrustVelocityScene } from './TrustVelocityScene';
import { FinalCTAScene } from './FinalCTAScene';
import React from 'react';

export const AutonomousPromo: React.FC = () => {
    return (
        <Series>
            <Series.Sequence durationInFrames={300}>
                <LegacyProblemScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={450}>
                <LiveScanScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={450}>
                <AgentDemoScene />
            </Series.Sequence>
            {/*
               TrustVelocity is usually 150 frames in the original file.
               We'll allocate 300 frames (10s) for it.
             */}
            <Series.Sequence durationInFrames={300}>
                <TrustVelocityScene />
            </Series.Sequence>
            <Series.Sequence durationInFrames={300}>
                <FinalCTAScene />
            </Series.Sequence>
        </Series>
    );
};
