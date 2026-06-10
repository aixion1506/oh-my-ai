#!/bin/bash
# devcontainer 안에서 askurl-net의 PostgreSQL(askurl-timescaledb)을
# localhost:15432로 중계한다.
# VS Code의 자동 포트포워딩(localhost:15432)이 이 포트를 맥으로 연결해주므로,
# DataGrip 등 GUI 클라이언트에서 localhost:15432로 바로 접속할 수 있다.
if command -v socat >/dev/null 2>&1 && getent hosts askurl-timescaledb >/dev/null 2>&1; then
    if ! ss -tln 2>/dev/null | grep -q ':15432 '; then
        nohup socat TCP-LISTEN:15432,fork,reuseaddr TCP:askurl-timescaledb:5432 \
            > /tmp/pg-proxy.log 2>&1 &
        disown
    fi
fi
