FROM public.ecr.aws/lambda/python:3.11

# Install ffmpeg
RUN yum install -y tar xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz && \
    tar xf /tmp/ffmpeg.tar.xz -C /tmp && \
    mv /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
    mv /tmp/ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Set PATH
ENV PATH="/usr/local/bin:${PATH}"

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code
COPY lambda_function.py .

# Set the CMD to handler
CMD ["lambda_function.lambda_handler"]
