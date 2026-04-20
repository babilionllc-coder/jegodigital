for asset in $1; do
    base=$(basename "$asset")
    if [[ ! -f "website/$asset" ]]; then
        # Handle query params if any
        clean_base=$(echo "$base" | cut -d'?' -f1)
        clean_asset=$(echo "$asset" | cut -d'?' -f1)
        blob=$(git rev-list --all --objects | grep "$clean_base" | head -n 1 | awk '{print $1}')
        if [[ -n "$blob" ]]; then
            echo "Restoring $clean_asset from blob $blob"
            dir=$(dirname "website/$clean_asset")
            mkdir -p "$dir"
            git cat-file -p "$blob" > "website/$clean_asset"
        else
            echo "FAILED to find blob for $asset"
        fi
    fi
done
