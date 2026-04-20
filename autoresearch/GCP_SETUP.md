# Run Autoresearch on GCP — Step by Step

**Cost: ~$0.09/hr (T4 Spot VM) = ~$0.72 for 8 hours overnight**

## Step 1: Open Google Cloud Console

Go to: https://console.cloud.google.com
Sign in with: babilionllc@gmail.com

## Step 2: Create the GPU VM (one command)

Open **Cloud Shell** (the terminal icon at the top right of the console), then paste this:

```bash
gcloud compute instances create autoresearch-vm \
  --zone=us-central1-a \
  --machine-type=n1-standard-4 \
  --accelerator=type=nvidia-tesla-t4,count=1 \
  --image-family=pytorch-latest-gpu \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=50GB \
  --maintenance-policy=TERMINATE \
  --provisioning-model=SPOT \
  --metadata="install-nvidia-driver=True"
```

This creates:
- n1-standard-4 (4 vCPUs, 15GB RAM) — ~$0.04/hr spot
- 1x NVIDIA T4 GPU (16GB VRAM) — ~$0.09/hr spot
- 50GB disk — plenty for PyTorch + autoresearch
- Pre-installed CUDA + PyTorch (Deep Learning VM image)
- **Total: ~$0.13/hr spot price**

> If T4 is unavailable in us-central1-a, try: us-central1-b, us-east1-c, or europe-west1-b

## Step 3: SSH into the VM

```bash
gcloud compute ssh autoresearch-vm --zone=us-central1-a
```

## Step 4: Install and Run Autoresearch

Paste this entire block:

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# Clone autoresearch
git clone https://github.com/karpathy/autoresearch.git
cd autoresearch

# Install dependencies (will complete fine — plenty of disk space)
uv sync

# Download data + train tokenizer (~2 min)
uv run prepare.py

# Test a single 5-minute training run
uv run train.py
```

If `uv run train.py` completes and prints a `val_bpb` score, everything works!

## Step 5: Run Autonomous Research Overnight

Point Claude Code (or any AI agent) at `program.md` and let it loop:

```
Hi have a look at program.md and let's kick off a new experiment! let's do the setup first.
```

Or if you don't have Claude Code on the VM, you can use the autoresearch-lite autonomous loop approach — just let `train.py` modifications loop automatically.

## Step 6: IMPORTANT — Stop the VM When Done!

```bash
# From Cloud Shell (not the VM):
gcloud compute instances stop autoresearch-vm --zone=us-central1-a

# Or delete it entirely:
gcloud compute instances delete autoresearch-vm --zone=us-central1-a
```

**If you forget to stop it, it costs ~$3.12/day.** Set a reminder!

## Troubleshooting

**"Quota exceeded" error:** You need GPU quota. Go to:
https://console.cloud.google.com/iam-admin/quotas
Filter for "NVIDIA T4" in us-central1, request increase to 1.

**"Zone does not have enough resources":** Try a different zone:
```bash
gcloud compute accelerator-types list --filter="name=nvidia-tesla-t4"
```

**VM was preempted (Spot instance stopped):** This is normal for Spot VMs. Just restart:
```bash
gcloud compute instances start autoresearch-vm --zone=us-central1-a
```
