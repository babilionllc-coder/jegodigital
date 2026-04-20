import { AbsoluteFill, Audio, Img, Series, staticFile } from "remotion";
import { AnimatedText } from "../AnimatedText";

export const Property1468Promo: React.FC = () => {
    // GoodLifeTulum Brand Colors
    const bgSand = "#F1EBE3";
    const bgSandDark = "#DFCFBE";
    const textTeal = "#2a3c3c";
    const textMint = "#86BDBB";

    const titleStyle: React.CSSProperties = {
        color: textTeal,
        fontSize: "80px",
    };

    const titleMintStyle: React.CSSProperties = {
        color: textMint,
        fontSize: "80px",
        fontWeight: 600,
    };

    const subtitleStyle: React.CSSProperties = {
        color: textTeal,
        fontSize: "50px",
        marginTop: "20px",
    };

    // 13 assets extracted from CDN 
    const hookImg = staticFile("assets/property_1468/los_arboles_15.jpeg");
    const featImg1 = staticFile("assets/property_1468/T14.jpeg"); // Interior
    const featImg2 = staticFile("assets/property_1468/5GeoRfYgno-WhatsApp_Image_2025-04-18_at_21.00.57.jpeg"); // Garden
    const lifeImg1 = staticFile("assets/property_1468/IMG_8172.jpeg"); // Pool/Community
    const lifeImg2 = staticFile("assets/property_1468/casa_2.jpeg"); // Exterior
    const offerImg = staticFile("assets/property_1468/montesino.jpg"); // Hero Focus
    const logoImg = staticFile("assets/property_1468/C8ATbZff3o-WhatsApp.png"); // Golden Logo

    return (
        <AbsoluteFill style={{ backgroundColor: bgSand }}>
            {/* Import the Google Fonts natively to bypass package issues */}
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Josefin+Sans:wght@300;400;500&display=swap" />

            <Series>
                {/* Scene 1: The Hook (6.00s => 180 frames) 
            Audio: scene1.mp3 is 5.29s (158 frames) */}
                <Series.Sequence durationInFrames={180}>
                    <AbsoluteFill style={{ backgroundColor: bgSandDark }}>
                        <Img src={hookImg} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} />
                        {/* Soft dark gradient for readability on the sand theme bottom */}
                        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(235, 227, 215, 0.95) 0%, rgba(235, 227, 215, 0.0) 60%)" }} />
                        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "120px" }}>
                            <div style={{ backgroundColor: "rgba(255,255,255,0.7)", padding: "40px", borderRadius: "16px", backdropFilter: "blur(10px)" }}>
                                <AnimatedText text="Why keep paying rent?" style={titleStyle} isHeading={true} />
                                <AnimatedText text="Invest in Xpu Ha, Tulum." style={subtitleStyle} delay={30} isHeading={false} />
                            </div>
                        </AbsoluteFill>
                        <Audio src={staticFile("assets/property_1468/voiceovers/scene1.mp3")} />
                    </AbsoluteFill>
                </Series.Sequence>

                {/* Scene 2: The Features (6.5s => 195 frames) 
            Audio: scene2.mp3 is 6.03s (181 frames) */}
                <Series.Sequence durationInFrames={195}>
                    <AbsoluteFill style={{ backgroundColor: bgSand }}>
                        {/* Split Screen Image Trick */}
                        <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <Img src={featImg1} style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <Img src={featImg2} style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                        </div>

                        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(241, 235, 227, 0.95) 0%, rgba(241, 235, 227, 0.2) 60%)" }} />
                        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "120px" }}>
                            <AnimatedText text="2 Bedrooms" style={titleStyle} isHeading={true} />
                            <AnimatedText text="Turn-Key Ready" style={subtitleStyle} delay={20} isHeading={false} />
                        </AbsoluteFill>
                        <Audio src={staticFile("assets/property_1468/voiceovers/scene2.mp3")} />
                    </AbsoluteFill>
                </Series.Sequence>

                {/* Scene 3: The Lifestyle (7.0s => 210 frames)
            Audio: scene3.mp3 is 6.59s (198 frames) */}
                <Series.Sequence durationInFrames={210}>
                    <AbsoluteFill style={{ backgroundColor: bgSandDark }}>
                        <Img src={lifeImg1} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />
                        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(241, 235, 227, 0.9) 0%, transparent 50%)" }} />
                        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                            <div style={{ backgroundColor: "rgba(255,255,255,0.85)", padding: "40px 60px", borderRadius: "0", border: `1px solid ${textMint}` }}>
                                <AnimatedText text="Exclusive Gated Community" style={titleStyle} isHeading={true} />
                                <AnimatedText text="Shared Pool & Gardens" style={subtitleStyle} delay={30} isHeading={false} />
                            </div>
                        </AbsoluteFill>
                        <Audio src={staticFile("assets/property_1468/voiceovers/scene3.mp3")} />
                    </AbsoluteFill>
                </Series.Sequence>

                {/* Scene 4: The Offer (7.5s => 225 frames) 
            Audio: scene4.mp3 is 7.05s (211 frames) */}
                <Series.Sequence durationInFrames={225}>
                    <AbsoluteFill style={{ backgroundColor: bgSand }}>
                        <Img src={offerImg} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />
                        <AbsoluteFill style={{ backgroundColor: "rgba(241, 235, 227, 0.7)", backdropFilter: "blur(4px)" }} />
                        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
                            <AnimatedText text="$170,000 USD" style={{ ...titleMintStyle, fontSize: "140px" }} isHeading={true} />
                            <AnimatedText text="50% Direct Owner Financing" style={{ ...subtitleStyle, fontWeight: 500, color: textTeal }} delay={30} isHeading={false} />
                            <AnimatedText text="for 24 Months" style={subtitleStyle} delay={50} isHeading={false} />
                        </AbsoluteFill>
                        <Audio src={staticFile("assets/property_1468/voiceovers/scene4.mp3")} />
                    </AbsoluteFill>
                </Series.Sequence>

                {/* Scene 5: Outro & Call to Action (3.0s => 90 frames + remaining length for total 900)
            Audio: scene5.mp3 is 4.36s (130 frames) => So scene 5 must be AT LEAST 130 frames!
            Let's make scene 5 = 150 frames. Total = 180+195+210+225+150 = 960 frames. */}
                <Series.Sequence durationInFrames={150}>
                    <AbsoluteFill style={{ backgroundColor: bgSand, justifyContent: "center", alignItems: "center" }}>
                        <Img src={logoImg} style={{ width: "250px", marginBottom: "40px", filter: "brightness(0) invert(0.2) sepia(0.5) hue-rotate(140deg) saturate(1)" }} />
                        <AnimatedText text="Make It Yours." style={{ ...titleStyle, fontSize: "60px", color: textMint }} isHeading={true} />
                        <AnimatedText text="WhatsApp: +52 984 321 5155" style={{ ...subtitleStyle, fontSize: "40px" }} delay={20} isHeading={false} />
                        <AnimatedText text="goodlifetulum.com" style={{ ...subtitleStyle, fontSize: "30px" }} delay={40} isHeading={false} />
                        <Audio src={staticFile("assets/property_1468/voiceovers/scene5.mp3")} />
                    </AbsoluteFill>
                </Series.Sequence>
            </Series>
        </AbsoluteFill>
    );
};
