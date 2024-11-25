import re
import os

current_path = os.path.dirname(os.path.abspath(__file__))

def main():
    chapter = {"id": 1}
    with open(os.path.join(current_path, "test-footnote.md"), "r") as f:
        content = f.read()
    content = re.sub(r"\[(\d+)\]", rf"[^{chapter['id']}_\1]", content)
    content = re.sub(r"(\r|\n|\r\n)(\[\^\d+_\d+\])", rf"\1\2: ", content)
    with open(os.path.join(current_path, "test-footnote.result.md"), "w") as f:
        f.write(content)

main()