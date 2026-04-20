# Run Autoresearch on Google Colab (FREE T4 GPU)

**Cost: $0 | GPU: NVIDIA Tesla T4 (16GB VRAM) | Session limit: ~12 hours**

## What This Does

Karpathy's autoresearch lets an AI agent autonomously experiment with ML training code overnight. It modifies `train.py`, trains for 5 minutes, checks if the result improved (val_bpb), keeps or discards, and repeats. You wake up to a log of experiments and a better model.

## Important: Use autoresearch-lite (NOT the original repo)

The original `karpathy/autoresearch` uses **Flash Attention 3** which only works on **H100/Ampere+ GPUs**. The free Colab T4 is Turing architecture and will crash with:

```
RuntimeError: FlashAttention only supports Ampere GPUs or newer.
```

**Solution:** Use `parthwhy/autoresearch-lite` — a community fork that replaces Flash Attention with PyTorch SDPA and tunes hyperparameters for T4.

## Verified Results (April 13, 2026)

| Metric | Value |
|---|---|
| val_bpb | 1.485858 |
| training_seconds | 300.3 |
| peak_vram_mb | 1732.2 |
| total_tokens | 13.1M |
| num_steps | 797 |
| num_params | 11.5M |
| depth | 4 |
| window_pattern | L |

## Step-by-Step Setup

### 1. Open Google Colab

Go to: https://colab.research.google.com
Sign in with: babilionllc@gmail.com (authuser=2)

### 2. Create a New Notebook

File → New notebook

### 3. Enable T4 GPU

Runtime → Change runtime type → T4 GPU → Save

### 4. Verify GPU (Cell 1)

```python
!nvidia-smi
```

Expected: Tesla T4, 15360MiB, CUDA 13.0

### 5. Install uv + Clone autoresearch-lite (Cell 2)

```python
!curl -LsSf https://astral.sh/uv/install.sh | sh
!git clone https://github.com/parthwhy/autoresearch-lite.git autoresearch
%cd autoresearch
```

### 6. Install Dependencies (Cell 3)

```python
!uv sync
```

Installs ~74 packages including PyTorch 2.9+, triton, etc. Takes ~30 seconds.

### 7. Download Data + Train Tokenizer (Cell 4)

```python
!uv run prepare.py
```

Downloads 1 data shard, trains BPE tokenizer (vocab_size=8192). Takes ~2 minutes.

### 8. Run Training Experiment (Cell 5)

```python
!uv run train.py
```

Trains an 11.5M parameter GPT model for exactly 5 minutes. You'll see:
- Model config printed (n_layer=4, n_head=2, n_embd=256, window_pattern='L')
- Training steps with loss decreasing (5.4 → 4.1)
- bfloat16 warnings (harmless — T4 auto-falls back to float16)
- Final `val_bpb` score printed at the end

If you see a `val_bpb` score, **everything works!**

### 9. Run Autonomous Research (Optional)

To let an AI agent iterate autonomously, you'd point Claude Code at `program.md`:

```
Hi have a look at program.md and let's kick off a new experiment! let's do the setup first.
```

On Colab without Claude Code, you can manually iterate by editing `train.py` and re-running.

## Key Differences: Original vs Lite

| Setting | Original (H100) | Lite (T4) |
|---|---|---|
| Attention | Flash Attention 3 | PyTorch SDPA |
| Precision | bfloat16 | float16 |
| WINDOW_PATTERN | SSSL | L |
| DEPTH | 8 | 4 |
| n_embd | 512 | 256 |
| MAX_SEQ_LEN | 8192 | 256 |
| Parameters | 50.3M | 11.5M |

## Colab Session Limits

- Free tier: ~12 hours max per session
- GPU may disconnect after ~90 min idle
- Keep browser tab active or use Colab Pro ($10/month) for longer sessions
- At ~12 experiments/hour, you can run ~100+ experiments in one session

## Notebook URL

Your saved notebook: https://colab.research.google.com/drive/1a9mJA1pVx_6wi2S2JJwiRt4Mi6eMNH_M?authuser=2
