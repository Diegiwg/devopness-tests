.PHONY: build

build: build-request build-login

build-request:
	@bash build.sh request

build-login:
	@bash build.sh login
