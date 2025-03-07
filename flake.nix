{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = (import (inputs.nixpkgs) { inherit system; });
      in {
        # Shell dependencies
        devShell = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodePackages.nodejs
            nodePackages.npm
            nodePackages.typescript
            nodePackages.typescript-language-server
            python3
          ];
        };
      }
    );
}
