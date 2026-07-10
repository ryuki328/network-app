## 作業開始手順

### 1. mainブランチへ移動する

```bash
git switch main
```

### 2. mainブランチを最新状態にする

```bash
git pull origin main
```

### 3. 作業用ブランチを作成する

```bash
git switch -c feature/機能名
```

例：

```bash
git switch -c feature/layout
```

### 4. 現在のブランチを確認する

```bash
git branch
```

`*`が付いているブランチが、現在作業しているブランチです。

```text
* feature/layout
  main
```

### 5. ファイルを編集する

VS Codeなどで担当ファイルを編集し、保存します。

### 6. 変更内容を確認する

```bash
git status
```


### 7 指定したファイルのみコミット
```bash
git add script.js
git commit -m "変更内容を記述"
```

### 7.5 すべての変更をコミット

```bash
git add .
git commit -m "変更内容を記述"
```

### ローカル変更を完全に捨てて、最新mainを取得する

```bash
git switch main
git fetch origin
git reset --hard origin/main
```




### 8. 作業ブランチをGitHubへ送信する

初回：

```bash
git push -u origin feature/機能名
```

例：

```bash
git push -u origin feature/layout
```

2回目以降：

```bash
git push
```

### 9. GitHubでPull Requestを作成する

GitHubのリポジトリを開き、次の順に進みます。

```text
Pull requests
→ New pull request
```

次のように設定します。

```text
base: main
compare: 作業ブランチ名
```

変更内容を確認し、`Create pull request`を押します。