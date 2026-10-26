"""
Export MobileSAM (Apache-2.0, https://github.com/ChaoningZhang/MobileSAM) to ONNX for the browser "AI Perfect Fit".

Produces public/models/mobilesam/encoder.onnx (image -> embeddings) and decoder.onnx (points -> masks).

Usage (one time, any computer with Python 3.10+):
  pip install torch timm onnx onnxruntime onnxscript
  git clone https://github.com/ChaoningZhang/MobileSAM   (or download its mobile_sam/ folder + weights/mobile_sam.pt)
  python scripts/export_mobilesam.py --mobilesam path/to/MobileSAM --out public/models/mobilesam [--quantize]
"""
import argparse
import os
import sys
import warnings

import torch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mobilesam", required=True, help="folder that contains mobile_sam/ and weights/mobile_sam.pt")
    ap.add_argument("--out", default="public/models/mobilesam")
    ap.add_argument("--quantize", action="store_true", help="8-bit weights for MatMul/Gemm (≈3× smaller encoder)")
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    sys.path.insert(0, args.mobilesam)
    from mobile_sam import sam_model_registry
    from mobile_sam.utils.onnx import SamOnnxModel

    os.makedirs(args.out, exist_ok=True)
    sam = sam_model_registry["vit_t"](checkpoint=os.path.join(args.mobilesam, "weights", "mobile_sam.pt"))
    sam.eval()

    class Encoder(torch.nn.Module):
        """Input: normalised image [1,3,1024,1024] (SAM mean/std, zero padded). Output: [1,256,64,64]."""

        def __init__(self, model):
            super().__init__()
            self.enc = model.image_encoder

        def forward(self, image):
            return self.enc(image)

    export_kw = {"opset_version": args.opset, "do_constant_folding": True}
    if "dynamo" in torch.onnx.export.__code__.co_varnames:
        export_kw["dynamo"] = False  # classic TorchScript exporter: stable graphs for onnxruntime-web

    enc_path = os.path.join(args.out, "encoder.fp32.onnx")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        torch.onnx.export(
            Encoder(sam),
            (torch.randn(1, 3, 1024, 1024),),
            enc_path,
            input_names=["image"],
            output_names=["image_embeddings"],
            **export_kw,
        )
    print("encoder ->", enc_path, os.path.getsize(enc_path) // 1024, "KB")

    dec = SamOnnxModel(sam, return_single_mask=False)
    embed_dim = sam.prompt_encoder.embed_dim
    embed_size = sam.prompt_encoder.image_embedding_size
    dummy = {
        "image_embeddings": torch.randn(1, embed_dim, *embed_size, dtype=torch.float),
        "point_coords": torch.randint(low=0, high=1024, size=(1, 5, 2), dtype=torch.float),
        "point_labels": torch.randint(low=0, high=4, size=(1, 5), dtype=torch.float),
        "mask_input": torch.randn(1, 1, 4 * embed_size[0], 4 * embed_size[1], dtype=torch.float),
        "has_mask_input": torch.tensor([1], dtype=torch.float),
        "orig_im_size": torch.tensor([1500, 2250], dtype=torch.float),
    }
    dec_path = os.path.join(args.out, "decoder.onnx")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        torch.onnx.export(
            dec,
            tuple(dummy.values()),
            dec_path,
            input_names=list(dummy.keys()),
            output_names=["masks", "iou_predictions", "low_res_masks"],
            dynamic_axes={"point_coords": {1: "num_points"}, "point_labels": {1: "num_points"}},
            **export_kw,
        )
    print("decoder ->", dec_path, os.path.getsize(dec_path) // 1024, "KB")

    final_enc = os.path.join(args.out, "encoder.onnx")
    if args.quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantize_dynamic(enc_path, final_enc, weight_type=QuantType.QUInt8, op_types_to_quantize=["MatMul", "Gemm"])
        os.remove(enc_path)
    else:
        os.replace(enc_path, final_enc)
    print("encoder (final) ->", final_enc, os.path.getsize(final_enc) // 1024, "KB")


if __name__ == "__main__":
    main()
